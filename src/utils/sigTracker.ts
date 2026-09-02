/**
 * Tracks EVE Online cosmic signatures/anomalies per solar system, persisted in the browser's
 * localStorage. Signature IDs are only unique within a system, so all data is keyed by system
 * name. Systems that haven't been imported into for over a year are pruned automatically.
 */

/** A single signature/anomaly line as parsed from a copy-pasted probe scanner list. */
export interface ParsedSignature {
  id: string;
  entityKind: string;
  sigKind: string;
  name: string;
  strength: number;
  distance: string;
}

export interface SignatureRecord extends ParsedSignature {
  note: string;
  firstSeenAt: string;
  updatedAt: string;
}

export interface SystemRecord {
  name: string;
  updatedAt: string;
  signatures: Record<string, SignatureRecord>;
}

export interface SigTrackerStore {
  systems: Record<string, SystemRecord>;
}

export interface ImportDiff {
  /** IDs of signatures that weren't previously known for this system. */
  added: string[];
  /** IDs of signatures that were already known, but had at least one field change. */
  updated: string[];
  /** IDs of signatures that were already known and are unchanged. */
  unchanged: string[];
  /** Signatures previously known for this system that weren't present in this import. */
  missing: SignatureRecord[];
}

const STORAGE_KEY = "evelyn:sigTracker";
const EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;
let storageError: string | null = null;

/**
 * Splits a copy-pasted probe scanner line into fields. The game separates columns with tabs when
 * copied to the clipboard, but pasting through some clients/editors turns those into runs of
 * spaces instead, so both are accepted. Single spaces are preserved since signature/site names
 * are often made up of multiple words (e.g. "Relic Site").
 */
function splitFields(line: string): string[] {
  return line
    .split(/\t+|\s{2,}/u)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Parses a copy-pasted probe scanner list, one signature per line, in the format:
 * `<id>  <entity kind>  <signature kind>  <name>  <signal strength>%  <distance>`, e.g.
 * `EEY-668   Cosmic Signature   Relic Site  Decayed Serpentis Particle Accelerator   100.0%   52.16 AU`.
 * Lines that don't match this shape are ignored.
 */
export function parseSignatureList(text: string): ParsedSignature[] {
  const results: ParsedSignature[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const fields = splitFields(line);
    if (fields.length < 6) continue;

    const [id, entityKind, sigKind, name, strengthRaw, ...distanceParts] = fields;
    if (!id || !entityKind || !sigKind || !name || !strengthRaw) continue;

    const strength = parseFloat(strengthRaw.replace(/%/gu, ""));
    if (!Number.isFinite(strength)) continue;

    const distance = distanceParts.join(" ");
    if (!distance) continue;

    results.push({ id, entityKind, sigKind, name, strength, distance });
  }

  return results;
}

function isSigTrackerStore(value: unknown): value is SigTrackerStore {
  return (
    typeof value === "object" &&
    value !== null &&
    "systems" in value &&
    typeof (value as { systems: unknown }).systems === "object" &&
    (value as { systems: unknown }).systems !== null
  );
}

function pruneExpired(store: SigTrackerStore): SigTrackerStore {
  const now = Date.now();
  const systems: SigTrackerStore["systems"] = {};
  for (const [name, system] of Object.entries(store.systems)) {
    const updatedAt = new Date(system.updatedAt).getTime();
    if (Number.isFinite(updatedAt) && now - updatedAt <= EXPIRATION_MS) {
      systems[name] = system;
    }
  }
  return { systems };
}

function saveStore(store: SigTrackerStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    storageError = null;
  } catch (error) {
    storageError = error instanceof Error ? error.message : "Unknown storage error";
  }
}

/** Returns the latest storage error, if any. */
export function getStorageError(): string | null {
  return storageError;
}

/** Loads the store from localStorage, pruning (and persisting the removal of) expired systems. */
export function loadStore(): SigTrackerStore {
  let parsed: unknown = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
    storageError = null;
  } catch (error) {
    storageError = error instanceof Error ? error.message : "Failed to read from browser storage";
    return { systems: {} };
  }

  const store = isSigTrackerStore(parsed) ? parsed : { systems: {} };
  const pruned = pruneExpired(store);
  saveStore(pruned);
  return pruned;
}

/** Returns the store's system names, sorted alphabetically. */
export function getSystemNames(store: SigTrackerStore): string[] {
  return Object.keys(store.systems).sort((a, b) => a.localeCompare(b));
}

/** Returns a system's signatures as a list, sorted by ID. */
export function getSignatures(system: SystemRecord | undefined): SignatureRecord[] {
  if (!system) return [];
  return Object.values(system.signatures).sort((a, b) => a.id.localeCompare(b.id));
}

function fieldsEqual(a: SignatureRecord, b: ParsedSignature): boolean {
  return (
    a.entityKind === b.entityKind &&
    a.sigKind === b.sigKind &&
    a.name === b.name &&
    a.strength === b.strength &&
    a.distance === b.distance
  );
}

function isUnknownSignatureField(value: string): boolean {
  return /^unknown$/iu.test(value);
}

function mergeImportedSignature(
  prev: SignatureRecord,
  next: ParsedSignature,
  updatedAt: string,
): SignatureRecord {
  return {
    ...prev,
    ...next,
    sigKind:
      isUnknownSignatureField(next.sigKind) && !isUnknownSignatureField(prev.sigKind)
        ? prev.sigKind
        : next.sigKind,
    name:
      isUnknownSignatureField(next.name) && !isUnknownSignatureField(prev.name)
        ? prev.name
        : next.name,
    updatedAt,
  };
}

/**
 * Merges a freshly parsed signature list into the store for the given system: new signatures are
 * added, known ones have their scan data refreshed (while preserving notes), and none are
 * removed automatically — signatures missing from the import are reported in the diff so the
 * caller can decide whether to remove them (the pasted list may only be a partial/unscanned one).
 */
export function importSignatures(
  store: SigTrackerStore,
  systemName: string,
  parsed: ParsedSignature[],
): { store: SigTrackerStore; diff: ImportDiff } {
  const now = new Date().toISOString();
  const existingSignatures = store.systems[systemName]?.signatures ?? {};
  const signatures: Record<string, SignatureRecord> = {};
  const diff: ImportDiff = { added: [], updated: [], unchanged: [], missing: [] };

  const seenIds = new Set<string>();
  for (const p of parsed) {
    seenIds.add(p.id);
    const prev = existingSignatures[p.id];
    if (!prev) {
      signatures[p.id] = { ...p, note: "", firstSeenAt: now, updatedAt: now };
      diff.added.push(p.id);
    } else {
      const merged = mergeImportedSignature(prev, p, now);
      if (!fieldsEqual(merged, prev)) {
        signatures[p.id] = merged;
        diff.updated.push(p.id);
      } else {
        signatures[p.id] = prev;
        diff.unchanged.push(p.id);
      }
    }
  }

  for (const [id, sig] of Object.entries(existingSignatures)) {
    if (!seenIds.has(id)) {
      // Keep it for now; the caller can remove it explicitly once they confirm it's really gone.
      signatures[id] = sig;
      diff.missing.push(sig);
    }
  }

  const updatedStore: SigTrackerStore = {
    systems: {
      ...store.systems,
      [systemName]: { name: systemName, updatedAt: now, signatures },
    },
  };
  saveStore(updatedStore);
  return { store: updatedStore, diff };
}

/** Sets (or clears) the note on a single signature. */
export function setSignatureNote(
  store: SigTrackerStore,
  systemName: string,
  sigId: string,
  note: string,
): SigTrackerStore {
  const system = store.systems[systemName];
  const sig = system?.signatures[sigId];
  if (!system || !sig) return store;

  const updatedStore: SigTrackerStore = {
    systems: {
      ...store.systems,
      [systemName]: {
        ...system,
        signatures: { ...system.signatures, [sigId]: { ...sig, note } },
      },
    },
  };
  saveStore(updatedStore);
  return updatedStore;
}

/** Removes a single signature from a system. */
export function removeSignature(
  store: SigTrackerStore,
  systemName: string,
  sigId: string,
): SigTrackerStore {
  const system = store.systems[systemName];
  if (!system) return store;

  const signatures = { ...system.signatures };
  delete signatures[sigId];

  const updatedStore: SigTrackerStore = {
    systems: { ...store.systems, [systemName]: { ...system, signatures } },
  };
  saveStore(updatedStore);
  return updatedStore;
}

/** Removes multiple signatures from a system in one go (e.g. those reported as "missing"). */
export function removeSignatures(
  store: SigTrackerStore,
  systemName: string,
  sigIds: string[],
): SigTrackerStore {
  const system = store.systems[systemName];
  if (!system) return store;

  const signatures = { ...system.signatures };
  for (const id of sigIds) delete signatures[id];

  const updatedStore: SigTrackerStore = {
    systems: { ...store.systems, [systemName]: { ...system, signatures } },
  };
  saveStore(updatedStore);
  return updatedStore;
}

/** Removes an entire system and all of its signatures. */
export function removeSystem(store: SigTrackerStore, systemName: string): SigTrackerStore {
  const systems = { ...store.systems };
  delete systems[systemName];

  const updatedStore: SigTrackerStore = { systems };
  saveStore(updatedStore);
  return updatedStore;
}

/** Removes all saved systems and signatures. */
export function removeAllSystems(): SigTrackerStore {
  const updatedStore: SigTrackerStore = { systems: {} };
  saveStore(updatedStore);
  return updatedStore;
}

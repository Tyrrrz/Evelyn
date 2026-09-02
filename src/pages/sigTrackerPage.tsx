import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/layout.tsx";
import SigTrackerTable from "../components/sigTrackerTable.tsx";
import type { ImportDiff, SigTrackerStore } from "../utils/sigTracker.ts";
import {
  getSignatures,
  getStorageError,
  getSystemNames,
  importSignatures,
  loadStore,
  parseSignatureList,
  removeAllSystems,
  removeSignature,
  removeSignatures,
  removeSystem,
  setSignatureNote,
} from "../utils/sigTracker.ts";

const PLACEHOLDER_TEXT = "Copy-paste signatures from your probe scanner here";
const SYSTEM_INPUT_ID = "sig-tracker-system";
const SIGNATURE_LIST_TEXTAREA_ID = "sig-tracker-signatures";

function DiffSummary({ diff, onRemoveMissing }: { diff: ImportDiff; onRemoveMissing: () => void }) {
  return (
    <div className="mb-4 flex flex-col items-center gap-2 text-sm">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-zinc-300">
        <span>
          <span className="font-semibold text-emerald-400">{diff.added.length}</span> new
        </span>
        <span>
          <span className="font-semibold text-amber-400">{diff.updated.length}</span> updated
        </span>
        <span>
          <span className="font-semibold text-zinc-500">{diff.unchanged.length}</span> unchanged
        </span>
        <span>
          <span className="font-semibold text-red-400">{diff.missing.length}</span> not in this list
        </span>
      </div>
      {diff.missing.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs text-zinc-500">{diff.missing.map((s) => s.id).join(", ")}</div>
          <button
            type="button"
            onClick={onRemoveMissing}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-100 hover:border-red-500 hover:text-red-400"
          >
            Remove {diff.missing.length} signature{diff.missing.length === 1 ? "" : "s"} not in this
            list
          </button>
        </div>
      )}
    </div>
  );
}

function SystemList({
  systemNames,
  activeSystem,
  onSelect,
  onRemove,
}: {
  systemNames: string[];
  activeSystem: string;
  onSelect: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  if (systemNames.length === 0) {
    return <div className="text-sm text-zinc-500">No systems saved yet.</div>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {systemNames.map((name) => (
        <li key={name} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelect(name)}
            className={`flex-1 rounded px-2 py-1 text-left text-sm ${
              name === activeSystem
                ? "bg-amber-500/20 text-amber-300"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {name}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove all saved signatures for ${name}?`)) onRemove(name);
            }}
            title={`Remove ${name}`}
            aria-label={`Remove ${name}`}
            className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-red-400"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function SigTrackerPage() {
  const [store, setStore] = useState<SigTrackerStore>(() => loadStore());
  const systemNames = getSystemNames(store);

  const [systemName, setSystemName] = useState(() => systemNames[0] ?? "");
  const [text, setText] = useState("");
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const reportedStorageErrorRef = useRef<string | null>(null);

  const trimmedSystemName = systemName.trim();
  const currentSignatures = useMemo(
    () => getSignatures(store.systems[trimmedSystemName]),
    [store, trimmedSystemName],
  );
  const parsedCount = useMemo(() => parseSignatureList(text).length, [text]);

  useEffect(() => {
    const error = getStorageError();
    if (!error || error === reportedStorageErrorRef.current) return;

    alert(
      `Signature Tracker couldn't access browser storage. Data changes will only persist for this session.\n\nDetails: ${error}`,
    );
    reportedStorageErrorRef.current = error;
  }, [store]);

  const handleImport = () => {
    if (!trimmedSystemName) return;
    const parsed = parseSignatureList(text);
    if (parsed.length === 0) return;

    const result = importSignatures(store, trimmedSystemName, parsed);
    setStore(result.store);
    setDiff(result.diff);
    setText("");
  };

  const handleRemoveMissing = () => {
    if (!diff || diff.missing.length === 0) return;
    const updated = removeSignatures(
      store,
      trimmedSystemName,
      diff.missing.map((s) => s.id),
    );
    setStore(updated);
    setDiff({ ...diff, missing: [] });
  };

  const handleSelectSystem = (name: string) => {
    setSystemName(name);
    setDiff(null);
  };

  const handleRemoveSystem = (name: string) => {
    const updated = removeSystem(store, name);
    setStore(updated);
    if (name === trimmedSystemName) {
      setSystemName("");
      setDiff(null);
    }
  };

  const handleRemoveAll = () => {
    if (!confirm("Remove all saved systems and signatures?")) return;
    setStore(removeAllSystems());
    setSystemName("");
    setDiff(null);
  };

  return (
    <Layout
      title="Signature Tracker"
      subtitle="Keep track of cosmic signatures and anomalies between game sessions"
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-56">
          <h2 className="mb-2 text-sm font-medium text-zinc-400">Saved Systems</h2>
          <SystemList
            systemNames={systemNames}
            activeSystem={trimmedSystemName}
            onSelect={handleSelectSystem}
            onRemove={handleRemoveSystem}
          />
          {systemNames.length > 0 && (
            <button
              type="button"
              onClick={handleRemoveAll}
              className="mt-4 w-full rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-500 hover:border-red-500 hover:text-red-400"
            >
              Remove all systems
            </button>
          )}
        </aside>

        <div className="flex-1">
          <div className="mb-4 flex flex-col items-center gap-2">
            <div className="w-full max-w-2xl">
              <label
                htmlFor={SYSTEM_INPUT_ID}
                className="mb-1 block text-sm font-medium text-zinc-400"
              >
                System
              </label>
              <input
                id={SYSTEM_INPUT_ID}
                type="text"
                value={systemName}
                onChange={(e) => {
                  setSystemName(e.target.value);
                  setDiff(null);
                }}
                placeholder="e.g. Jita"
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="w-full max-w-2xl">
              <label
                htmlFor={SIGNATURE_LIST_TEXTAREA_ID}
                className="mb-1 block text-sm font-medium text-zinc-400"
              >
                Signature List
              </label>
              <textarea
                id={SIGNATURE_LIST_TEXTAREA_ID}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDER_TEXT}
                rows={10}
                spellCheck={false}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={!trimmedSystemName || parsedCount === 0}
              title="Import"
              aria-label="Import"
              className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import{" "}
              {parsedCount > 0 ? `${parsedCount} signature${parsedCount === 1 ? "" : "s"}` : ""}
            </button>
          </div>

          {diff && <DiffSummary diff={diff} onRemoveMissing={handleRemoveMissing} />}

          {!trimmedSystemName && (
            <div className="text-center text-sm text-zinc-500">
              Enter a system name above to browse or import signatures.
            </div>
          )}

          {trimmedSystemName && currentSignatures.length === 0 && (
            <div className="text-center text-sm text-zinc-500">
              No signatures saved for {trimmedSystemName} yet.
            </div>
          )}

          {trimmedSystemName && currentSignatures.length > 0 && (
<SigTrackerTable
              key={trimmedSystemName}
              rows={currentSignatures}
              onNoteChange={(sigId, note) => {
                setStore(setSignatureNote(store, trimmedSystemName, sigId, note));
              }}
              onRemove={(sigId) => {
                setStore(removeSignature(store, trimmedSystemName, sigId));
              }}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";

/**
 * Encodes a JSON-serializable value into a compact, URL-safe string: JSON -> deflate -> base64url.
 * Used to stash the full item appraisal input in the URL so a link can be shared/bookmarked
 * without needing any server-side storage.
 */
export function encodeStateToUrlParam(value: unknown): string {
  const json = strToU8(JSON.stringify(value));
  const compressed = zlibSync(json, { level: 9 });
  let binary = "";
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

/** Reverses {@link encodeStateToUrlParam}. Returns `null` if the string can't be decoded. */
export function decodeStateFromUrlParam<T>(param: string): T | null {
  try {
    const base64 = param.replace(/-/gu, "+").replace(/_/gu, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = strFromU8(unzlibSync(bytes));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

import { useState } from "react";
import type { SignatureRecord } from "../utils/sigTracker.ts";

/** Badge color classes keyed by entity kind, falling back to zinc for unrecognized kinds. */
function entityKindClass(entityKind: string): string {
  if (/anomaly/iu.test(entityKind)) return "bg-sky-900 text-sky-300";
  if (/signature/iu.test(entityKind)) return "bg-violet-900 text-violet-300";
  return "bg-zinc-800 text-zinc-400";
}

function NoteCell({ note, onChange }: { note: string; onChange: (note: string) => void }) {
  const [value, setValue] = useState(note);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== note) onChange(value);
      }}
      placeholder="Add a note…"
      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
    />
  );
}

export default function SigTrackerTable({
  rows,
  onNoteChange,
  onRemove,
}: {
  rows: SignatureRecord[];
  onNoteChange: (sigId: string, note: string) => void;
  onRemove: (sigId: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-800 text-zinc-300">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase">
              ID
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase">
              Kind
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase">
              Name
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase">
              Strength
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase">
              Distance
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase">
              Note
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((sig, i) => (
            <tr key={sig.id} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900"}>
              <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">{sig.id}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${entityKindClass(sig.entityKind)}`}
                >
                  {sig.sigKind}
                </span>
              </td>
              <td className="px-3 py-2">
                {sig.name === "Unknown" ? (
                  <span className="text-zinc-500 italic">Unscanned</span>
                ) : (
                  sig.name
                )}
                {sig.note !== "" && (
                  <div className="mt-1 max-w-xs text-xs whitespace-pre-wrap text-zinc-500">
                    {sig.note}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{sig.strength}%</td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{sig.distance}</td>
              <td className="px-3 py-2">
                <NoteCell note={sig.note} onChange={(note) => onNoteChange(sig.id, note)} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onRemove(sig.id)}
                  title={`Remove ${sig.id}`}
                  aria-label={`Remove ${sig.id}`}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-red-500 hover:text-red-400"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

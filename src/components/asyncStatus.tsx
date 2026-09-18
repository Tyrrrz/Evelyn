import type { ReactNode } from "react";

type AsyncStatusProps = {
  error: string | null;
  loading: boolean;
  progress: number | null;
  timestamp: Date | null;
  summary?: ReactNode;
}

/** Renders the error / loading+progress / fetched-summary blocks shared by async-driven pages. */
export default function AsyncStatus({
  error,
  loading,
  progress,
  timestamp,
  summary,
}: AsyncStatusProps) {
  return (
    <>
      {error && <div className="mb-4 text-center text-sm text-red-400">Error: {error}</div>}

      {loading && (
        <div className="mb-4 text-center text-sm text-zinc-400">
          Loading{progress !== null ? ` (${(progress * 100).toFixed(1)}%)` : ""}…
        </div>
      )}

      {timestamp && summary && (
        <div className="mb-4 text-center text-xs text-zinc-500">
          {summary} • fetched {timestamp.toLocaleString()}
        </div>
      )}
    </>
  );
}

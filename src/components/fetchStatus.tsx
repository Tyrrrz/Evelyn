import type { ReactNode } from "react";

interface FetchStatusProps {
  fetchedAt: Date | null;
  summary?: ReactNode;
  loading: boolean;
  progress: number | null;
  error: string | null;
  summaryClassName?: string;
}

/** Renders the fetched-summary / loading+progress / error blocks shared by fetch-driven pages. */
export default function FetchStatus({
  fetchedAt,
  summary,
  loading,
  progress,
  error,
  summaryClassName = "mb-4 text-center text-xs text-zinc-500",
}: FetchStatusProps) {
  return (
    <>
      {fetchedAt && summary && (
        <div className={summaryClassName}>
          {summary} • fetched {fetchedAt.toLocaleString()}
        </div>
      )}

      {loading && (
        <div className="mb-4 text-center text-sm text-zinc-400">
          Loading{progress !== null ? ` (${(progress * 100).toFixed(1)}%)` : ""}…
        </div>
      )}

      {error && <div className="mb-4 text-center text-sm text-red-400">Error: {error}</div>}
    </>
  );
}

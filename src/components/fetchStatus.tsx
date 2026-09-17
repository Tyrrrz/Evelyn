import type { ReactNode } from "react";

interface FetchStatusProps {
  fetchedAt: Date | null;
  summary?: ReactNode;
  loading: boolean;
  loadingLabel: ReactNode;
  progress: { done: number; total: number } | null;
  progressLabel: string;
  error: string | null;
  summaryClassName?: string;
}

/** Renders the fetched-summary / loading+progress / error blocks shared by fetch-driven pages. */
export default function FetchStatus({
  fetchedAt,
  summary,
  loading,
  loadingLabel,
  progress,
  progressLabel,
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
          {loadingLabel}
          {progress && (
            <span className="ml-2 text-zinc-500">
              ({progress.done}/{progress.total} {progressLabel})
            </span>
          )}
        </div>
      )}

      {error && <div className="mb-4 text-center text-sm text-red-400">Error: {error}</div>}
    </>
  );
}

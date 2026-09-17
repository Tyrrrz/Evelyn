import { useCallback, useState } from "react";

type OnProgress = (done: number, total: number) => void;

interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  progress: { done: number; total: number } | null;
  fetchedAt: Date | null;
}

const initialState: FetchState<never> = {
  data: null,
  error: null,
  loading: false,
  progress: null,
  fetchedAt: null,
};

/**
 * Runs an async task (e.g. an ESI fetch) and tracks its `data`/`error`/`loading`/`progress` state,
 * along with the `fetchedAt` timestamp of the last successful run.
 *
 * Unlike `useMemo`, the task is only ever run imperatively via the returned `run(...)` function —
 * it never re-runs automatically just because some dependency changed. Callers that need to
 * auto-trigger a run (e.g. once on mount from URL state) should do so from their own effect.
 */
export function useFetch<T, Args extends unknown[]>(
  task: (onProgress: OnProgress, ...args: Args) => Promise<T>,
) {
  const [state, setState] = useState<FetchState<T>>(initialState);

  const run = useCallback(
    (...args: Args) => {
      setState({ data: null, error: null, loading: true, progress: null, fetchedAt: null });

      void (async () => {
        try {
          const data = await task(
            (done, total) => {
              setState((prev) => ({ ...prev, progress: { done, total } }));
            },
            ...args,
          );
          setState({ data, error: null, loading: false, progress: null, fetchedAt: new Date() });
        } catch (e: unknown) {
          setState({
            data: null,
            error: e instanceof Error ? e.message : "Unknown error",
            loading: false,
            progress: null,
            fetchedAt: null,
          });
        }
      })();
    },
    [task],
  );

  return { ...state, run };
}

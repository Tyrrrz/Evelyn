import { useCallback, useState } from "react";

/** `data` and `error` are mutually exclusive: only one of them can be non-null at a time. */
type PromiseState<T> =
  | { data: null; error: null; loading: boolean; progress: number | null; fetchedAt: null }
  | { data: T; error: null; loading: false; progress: null; fetchedAt: Date }
  | { data: null; error: string; loading: false; progress: null; fetchedAt: null };

const idleState: PromiseState<never> = {
  data: null,
  error: null,
  loading: false,
  progress: null,
  fetchedAt: null,
};

/**
 * Runs an async task and tracks its `data`/`error`/`loading`/`progress` state, deriving
 * `fetchedAt` from the moment `data` is set on success.
 *
 * Unlike `useMemo`, the task is only ever run imperatively via the returned `run(...)` function —
 * it never re-runs automatically just because some value changed. Callers that need to
 * auto-trigger a run (e.g. once on mount from URL state) should do so from their own effect.
 */
export function usePromise<T>() {
  const [state, setState] = useState<PromiseState<T>>(idleState);

  const run = useCallback((task: (onProgress: (fraction: number) => void) => Promise<T>) => {
    setState({ data: null, error: null, loading: true, progress: null, fetchedAt: null });

    void (async () => {
      try {
        const data = await task((fraction) => {
          setState({ data: null, error: null, loading: true, progress: fraction, fetchedAt: null });
        });
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
  }, []);

  return { ...state, run };
}

import { useCallback, useRef, useState } from "react";

/** `data` and `error` are mutually exclusive: only one of them can be non-null at a time. */
type AsyncCallbackState<T> =
  | { data: null; error: null; loading: boolean; progress: number | null; timestamp: null }
  | { data: T; error: null; loading: false; progress: null; timestamp: Date }
  | { data: null; error: string; loading: false; progress: null; timestamp: null };

const idleState: AsyncCallbackState<never> = {
  data: null,
  error: null,
  loading: false,
  progress: null,
  timestamp: null,
};

/**
 * Wraps an async task in a stable `execute(...args)` callback and tracks its
 * `data`/`error`/`loading`/`progress` state, deriving `timestamp` from the moment `data` is set
 * on success.
 *
 * `execute(...)` is a no-op while a previous call is still in flight, so overlapping calls (e.g. a
 * dev-mode double-invoke, or a user triggering search twice in a row) can't race to set state
 * from whichever promise settles last.
 */
export function useAsyncCallback<Args extends unknown[], T>(
  task: (options: { onProgress?: (fraction: number) => void }, ...args: Args) => Promise<T>,
) {
  const [state, setState] = useState<AsyncCallbackState<T>>(idleState);
  const loadingRef = useRef(false);

  const execute = useCallback(
    (...args: Args) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      setState({ data: null, error: null, loading: true, progress: null, timestamp: null });

      // Wrap the whole function in a Promise so that synchronous errors are handled in the same way
      Promise.resolve()
        .then(() =>
          task(
            {
              onProgress: (fraction) => {
                setState({
                  data: null,
                  error: null,
                  loading: true,
                  progress: fraction,
                  timestamp: null,
                });
              },
            },
            ...args,
          ),
        )
        .then((data) => {
          setState({ data, error: null, loading: false, progress: null, timestamp: new Date() });
        })
        .catch((e: unknown) => {
          setState({
            data: null,
            error: e instanceof Error ? e.message : "Unknown error",
            loading: false,
            progress: null,
            timestamp: null,
          });
        })
        .finally(() => {
          loadingRef.current = false;
        });
    },
    [task],
  );

  return { ...state, execute };
}

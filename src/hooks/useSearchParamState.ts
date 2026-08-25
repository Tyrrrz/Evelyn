import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

interface SearchParamStateOptions<T> {
  serialize?: (value: T) => string | undefined;
  /** Return `undefined` to fall back to the initial state (e.g. when the param is malformed). */
  deserialize?: (raw: string) => T | undefined;
}

/**
 * Like `useState`, but persists the value in a URL search param (replacing the current
 * history entry) so that the page's state survives reloads and can be shared via link.
 */
export function useSearchParamState<T>(
  key: string,
  initialState: T | (() => T),
  options: SearchParamStateOptions<T> = {},
): [T, (value: T) => void] {
  const { serialize = String, deserialize } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const [fallbackState] = useState(initialState);
  const state = useMemo(() => {
    const raw = searchParams.get(key);
    const parsed = raw !== null && deserialize ? deserialize(raw) : undefined;
    return parsed !== undefined ? parsed : fallbackState;
  }, [searchParams, key, deserialize, fallbackState]);

  const setPersistedState = useCallback(
    (value: T) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          const serialized = serialize(value);
          if (serialized === undefined) params.delete(key);
          else params.set(key, serialized);
          return params;
        },
        { replace: true },
      );
    },
    [key, serialize, setSearchParams],
  );

  return [state, setPersistedState];
}

/** {@link SearchParamStateOptions} for a boolean value, encoded as `"true"`/`"false"`. */
export const boolSearchParam: SearchParamStateOptions<boolean> = {
  serialize: String,
  deserialize: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
};

/** {@link SearchParamStateOptions} for a finite number value. */
export const numberSearchParam: SearchParamStateOptions<number> = {
  serialize: String,
  deserialize: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  },
};

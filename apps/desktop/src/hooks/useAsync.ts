import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  { status: "loading" } | { status: "ready"; value: T } | { status: "error"; error: unknown };

/** Runs `load` when `key` changes; `reload()` runs it again. Stale answers are dropped. */
export function useAsync<T>(
  load: () => Promise<T>,
  key: string,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<{ key: string; attempt: number; result: AsyncState<T> }>({
    key,
    attempt: 0,
    result: { status: "loading" },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (value) => !cancelled && setState({ key, attempt, result: { status: "ready", value } }),
      (error: unknown) =>
        !cancelled && setState({ key, attempt, result: { status: "error", error } }),
    );
    return () => {
      cancelled = true;
    };
    // `load` is a new closure each render; `key` and `attempt` say when to run it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const result: AsyncState<T> =
    state.key === key && state.attempt === attempt ? state.result : { status: "loading" };
  return { ...result, reload };
}

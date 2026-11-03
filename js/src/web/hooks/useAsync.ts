// The value of a promise as state: undefined while pending, or { error }. `make` runs
// again when `deps` change, as for useEffect.
import { useEffect, useState } from "react";

export type AsyncState<T> = { value: T } | { error: string } | undefined;

export function useAsync<T>(make: (() => Promise<T>) | null, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>(undefined);
  useEffect(() => {
    setState(undefined);
    if (!make) return;
    let cancelled = false;
    make().then(
      (value) => !cancelled && setState({ value }),
      (err: unknown) => !cancelled && setState({ error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, deps);
  return state;
}

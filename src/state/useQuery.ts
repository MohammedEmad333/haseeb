/**
 * Read from the database inside a component.
 *
 * The driver is async, so a screen cannot compute its view with `useMemo` any
 * more. This hook is the one place that handles the consequences: it tracks
 * loading and error state, re-runs when the database commits, and — the part
 * that is easy to get wrong — discards the result of a query that has been
 * superseded, so a slow read cannot overwrite a newer one.
 */

import { useEffect, useState } from 'react';
import { useHaseeb } from './HaseebProvider';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useQuery<T>(
  run: () => Promise<T>,
  deps: readonly unknown[],
): QueryState<T> {
  const { revision, status } = useHaseeb();
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (status !== 'ready') return;

    let live = true;
    // Keep the previous data on screen while refreshing: blanking the page on
    // every commit would make the app flicker after each sale.
    setState((s) => ({ ...s, loading: true, error: null }));

    run()
      .then((data) => {
        if (live) setState({ data, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setState({
          data: null,
          loading: false,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      });

    return () => {
      live = false;
    };
    // `revision` is the database's change signal; the caller's deps cover the
    // rest. The query function itself is intentionally not a dependency — it
    // is redefined on every render and would loop.
     
  }, [revision, status, ...deps]);

  return state;
}

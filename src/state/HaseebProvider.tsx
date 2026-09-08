/**
 * Application state.
 *
 * The database is the state. This provider opens it once, exposes the
 * repositories, and re-renders subscribers whenever a mutation commits — so
 * a sale rung up on the POS screen updates the dashboard and the debt ledger
 * without any screen having to know the others exist.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { openHaseeb, resetToSeed, type Haseeb } from '@/db';
import type { BusinessProfile } from '@/db/types';
import { getNumberingSystem, setNumberingSystem, type NumberingSystem } from '@/lib/format';

export type DbStatus = 'opening' | 'ready' | 'error';

interface HaseebContextValue extends Partial<Haseeb> {
  status: DbStatus;
  error: Error | null;
  /** Bumped on every commit; screens read it to recompute derived views. */
  revision: number;
  profile: BusinessProfile | null;
  syncPending: number;
  storageLocation: string;
  storageUsedBytes: number;
  search: string;
  setSearch: (value: string) => void;
  numbering: NumberingSystem;
  setNumbering: (system: NumberingSystem) => void;
  reset: () => void;
  retry: () => void;
}

const HaseebContext = createContext<HaseebContextValue | null>(null);

export function HaseebProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<Haseeb | null>(null);
  const [status, setStatus] = useState<DbStatus>('opening');
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('opening');
    setError(null);

    openHaseeb()
      .then((h) => {
        if (cancelled) {
          h.db.close();
          return;
        }
        // Apply the stored digit preference before the first paint, so the
        // numbers never flip in front of the user on load.
        const stored = h.ops.preference('numbering');
        if (stored === 'arab' || stored === 'latn') setNumberingSystem(stored);
        setHandle(h);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Every committed mutation bumps the revision, which is what makes the
  // whole app consistent after a checkout or a payment.
  useEffect(() => {
    if (!handle) return;
    return handle.db.subscribe(() => setRevision((r) => r + 1));
  }, [handle]);

  // Seal the image to storage before the tab goes away, so the last few
  // seconds of work survive a close that beats the debounce.
  useEffect(() => {
    if (!handle) return;
    const flush = (): void => void handle.db.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, [handle]);

  const reset = useCallback(() => {
    if (!handle) return;
    resetToSeed(handle.db);
    void handle.db.flush();
  }, [handle]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const setNumbering = useCallback(
    (system: NumberingSystem) => {
      setNumberingSystem(system);
      handle?.ops.setPreference(
        'numbering',
        system,
        `تغيير عرض الأرقام إلى ${system === 'arab' ? 'العربية' : 'الإنجليزية'}`,
      );
      void handle?.db.flush();
      // The formatter is module state, so nothing re-renders on its own.
      setRevision((r) => r + 1);
    },
    [handle],
  );

  const value = useMemo<HaseebContextValue>(() => {
    const derived =
      handle && status === 'ready'
        ? {
            profile: handle.ops.profile(),
            syncPending: handle.ops.pendingSyncCount(),
            storageUsedBytes: estimateSize(handle),
            storageLocation: handle.db.storageLocation,
          }
        : { profile: null, syncPending: 0, storageUsedBytes: 0, storageLocation: '' };

    return {
      ...(handle ?? {}),
      status,
      error,
      revision,
      search,
      setSearch,
      numbering: getNumberingSystem(),
      setNumbering,
      reset,
      retry,
      ...derived,
    };
    // `revision` is a deliberate dependency: it is the signal that the
    // derived reads above are stale.
  }, [handle, status, error, revision, search, reset, retry, setNumbering]);

  return <HaseebContext.Provider value={value}>{children}</HaseebContext.Provider>;
}

export function useHaseeb(): HaseebContextValue {
  const context = useContext(HaseebContext);
  if (!context) throw new Error('useHaseeb must be used inside <HaseebProvider>');
  return context;
}

/**
 * The repositories, for screens that only render once the database is ready.
 * Throws if called while opening, which keeps every screen from having to
 * null-check five repositories.
 */
export function useRepositories(): Haseeb {
  const context = useHaseeb();
  if (context.status !== 'ready' || !context.db) {
    throw new Error('repositories read before the database was ready');
  }
  return context as Haseeb;
}

/**
 * Rough on-disk size of the local database, for the storage card. Counting
 * rows is far cheaper than exporting the image on every render.
 */
function estimateSize(handle: Haseeb): number {
  const rows =
    handle.db.count('sales') +
    handle.db.count('sale_lines') +
    handle.db.count('invoices') +
    handle.db.count('invoice_lines') +
    handle.db.count('stock_movements') +
    handle.db.count('payments') +
    handle.db.count('debts') +
    handle.db.count('audit_log') +
    handle.db.count('sync_queue');
  // SQLite page overhead plus roughly a quarter kilobyte per row.
  return 64 * 1024 + rows * 256;
}

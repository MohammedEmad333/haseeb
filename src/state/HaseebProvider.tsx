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
import { openHaseeb, wipeDatabase, type Haseeb } from '@/db';
import { isChunkLoadError } from '@/db/drivers';
import type { BusinessProfile } from '@/db/types';
import { getNumberingSystem, setNumberingSystem, type NumberingSystem } from '@/lib/format';

export type DbStatus = 'opening' | 'ready' | 'error';

interface HaseebContextValue extends Partial<Haseeb> {
  status: DbStatus;
  error: Error | null;
  /** Which driver is in use: 'sqljs' on web and under test, 'capacitor' on a phone. */
  engine: string;
  /** Bumped on every commit; screens read it to recompute derived views. */
  revision: number;
  profile: BusinessProfile | null;
  syncPending: number;
  storageLocation: string;
  storageUsedBytes: number;
  search: string;
  setSearch: (value: string) => void;
  numbering: NumberingSystem;
  setNumbering: (system: NumberingSystem) => Promise<void>;
  reset: () => Promise<void>;
  retry: () => void;
}

interface HeaderFigures {
  profile: BusinessProfile | null;
  syncPending: number;
  storageUsedBytes: number;
}

const HaseebContext = createContext<HaseebContextValue | null>(null);

export function HaseebProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<Haseeb | null>(null);
  const [status, setStatus] = useState<DbStatus>('opening');
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [header, setHeader] = useState<HeaderFigures>({
    profile: null,
    syncPending: 0,
    storageUsedBytes: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setStatus('opening');
    setError(null);

    // The app ships with no demo data: a fresh install opens to an empty
    // database and onboarding, not a pre-populated sample business.
    openHaseeb({ seedIfEmpty: false })
      .then(async (h) => {
        if (cancelled) {
          await h.db.close();
          return;
        }
        // Apply the stored digit preference and read the header figures before
        // the first paint, so nothing flips in front of the user on load.
        const stored = await h.ops.preference('numbering');
        if (stored === 'arab' || stored === 'latn') setNumberingSystem(stored);
        setHeader(await readHeader(h));
        if (cancelled) return;
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

  const reset = useCallback(async () => {
    if (!handle) return;
    await wipeDatabase(handle.db);
    await handle.db.flush();
  }, [handle]);

  const retry = useCallback(() => {
    // A chunk that failed to load is errored in the module map for the life of
    // the document: importing it again returns the same error without a
    // request, so retrying in place would hand the user the same screen twice.
    // A reload is a fresh module map, and the only thing that can work.
    if (isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
    setAttempt((a) => a + 1);
  }, [error]);

  const setNumbering = useCallback(
    async (system: NumberingSystem) => {
      setNumberingSystem(system);
      await handle?.ops.setPreference(
        'numbering',
        system,
        `تغيير عرض الأرقام إلى ${system === 'arab' ? 'العربية' : 'الإنجليزية'}`,
      );
      await handle?.db.flush();
      // The formatter is module state, so nothing re-renders on its own.
      setRevision((r) => r + 1);
    },
    [handle],
  );

  // The header figures come from the database, so they are read
  // asynchronously and refreshed on every commit rather than computed inline.
  useEffect(() => {
    if (!handle || status !== 'ready') return;
    let live = true;
    void readHeader(handle).then((next) => {
      if (live) setHeader(next);
    });
    return () => {
      live = false;
    };
  }, [handle, status, revision]);

  const value = useMemo<HaseebContextValue>(
    () => ({
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
      engine: handle?.db.engine ?? '',
      storageLocation: handle?.db.storageLocation ?? '',
      ...header,
    }),
    [handle, status, error, revision, search, reset, retry, setNumbering, header],
  );

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
async function estimateSize(handle: Haseeb): Promise<number> {
  const tables = [
    'sales',
    'sale_lines',
    'invoices',
    'invoice_lines',
    'stock_movements',
    'payments',
    'debts',
    'journal_entries',
    'journal_lines',
    'credit_notes',
    'cash_shifts',
    'audit_log',
    'sync_queue',
  ];
  let rows = 0;
  for (const table of tables) rows += await handle.db.count(table);
  // SQLite page overhead plus roughly a quarter kilobyte per row.
  return 64 * 1024 + rows * 256;
}

/** The figures the shell shows on every screen. */
async function readHeader(handle: Haseeb): Promise<HeaderFigures> {
  return {
    profile: await handle.ops.profile(),
    syncPending: await handle.ops.pendingSyncCount(),
    storageUsedBytes: await estimateSize(handle),
  };
}

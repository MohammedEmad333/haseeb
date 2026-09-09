/**
 * Who is signed in.
 *
 * The session lives in memory only. It is deliberately not persisted: a shop
 * device is shared, and a session that survived a restart would mean the first
 * person to pick the phone up in the morning is whoever closed it last night —
 * with their name on every sale they ring up.
 *
 * The screen locks itself after a period of no interaction for the same
 * reason: a till left open on the manager's account is how the profit report
 * ends up on display.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useHaseeb } from './HaseebProvider';
import type { Account, SignInResult } from '@/db';
import type { Ability } from '@/domain/abilities';

/** Inactivity before the screen locks. */
export const AUTO_LOCK_MS = 10 * 60 * 1000;

interface SessionContextValue {
  account: Account | null;
  /** True once we know whether an owner account needs creating. */
  ready: boolean;
  needsOwnerSetup: boolean;
  signIn: (id: string, pin: string) => Promise<SignInResult>;
  signOut: () => void;
  /** Re-read the signed-in account after its abilities change. */
  refresh: () => Promise<void>;
  can: (ability: Ability) => boolean;
  /** The name recorded against everything this session writes. */
  actor: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { accounts, db, status, revision } = useHaseeb();
  const [account, setAccount] = useState<Account | null>(null);
  const [needsOwnerSetup, setNeedsOwnerSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inSetup = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !accounts) return;
    // First-run setup stays on screen until someone actually signs in.
    // Creating the manager account answers this question differently, and
    // swapping the screen out at that moment would take the one-time recovery
    // code with it — which is the only copy that will ever exist.
    if (inSetup.current) return;

    let live = true;
    void accounts.needsOwnerSetup().then((needed) => {
      if (!live) return;
      inSetup.current = needed;
      setNeedsOwnerSetup(needed);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [accounts, status, revision]);

  const signOut = useCallback(() => {
    setAccount(null);
    db?.setActor('النظام');
  }, [db]);

  // Everything written from here on is credited to the signed-in user.
  useEffect(() => {
    db?.setActor(account?.name ?? 'النظام');
  }, [db, account]);

  // Signing in is what ends first-run setup.
  useEffect(() => {
    if (!account) return;
    inSetup.current = false;
    setNeedsOwnerSetup(false);
  }, [account]);

  // Auto-lock. Any interaction restarts the clock; none for AUTO_LOCK_MS and
  // the session ends.
  useEffect(() => {
    if (!account) return;

    const arm = (): void => {
      if (lockTimer.current) clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(signOut, AUTO_LOCK_MS);
    };

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'focus'];
    for (const event of events) window.addEventListener(event, arm);
    arm();

    return () => {
      for (const event of events) window.removeEventListener(event, arm);
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [account, signOut]);

  const signIn = useCallback(
    async (id: string, pin: string): Promise<SignInResult> => {
      if (!accounts) return { ok: false, reason: 'unknown' };
      const result = await accounts.signIn(id, pin);
      if (result.ok) setAccount(result.account);
      return result;
    },
    [accounts],
  );

  const refresh = useCallback(async () => {
    if (!accounts || !account) return;
    const fresh = await accounts.byId(account.id);
    // An account suspended while signed in loses the session on the spot.
    setAccount(fresh && fresh.active ? fresh : null);
  }, [accounts, account]);

  // Abilities can change under a signed-in user, so re-read on every commit.
  useEffect(() => {
    if (!account) return;
    void refresh();
     
  }, [revision]);

  const value = useMemo<SessionContextValue>(() => {
    const granted = new Set(account?.abilities ?? []);
    return {
      account,
      ready,
      needsOwnerSetup,
      signIn,
      signOut,
      refresh,
      can: (ability) => granted.has(ability),
      actor: account?.name ?? 'النظام',
    };
  }, [account, ready, needsOwnerSetup, signIn, signOut, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HaseebProvider, useHaseeb } from '@/state/HaseebProvider';
import { SessionProvider, useSession } from '@/state/SessionProvider';
import { AppShell } from '@/shell/AppShell';
import { RequireAbility } from '@/shell/Guard';
import { SignIn } from '@/screens/auth/SignIn';
import { OwnerSetup } from '@/screens/auth/OwnerSetup';
import { SCREENS } from '@/shell/screens';
import type { Ability } from '@/domain/abilities';
import { Button, ErrorState, SkeletonCard } from '@/ui/primitives';
import { AutoGrid } from '@/ui/composites';
import { Dashboard } from '@/screens/Dashboard';
import { PointOfSale } from '@/screens/PointOfSale';
import { Finance } from '@/screens/Finance';
import { Wholesale } from '@/screens/Wholesale';
import { Debts } from '@/screens/Debts';
import { Orders } from '@/screens/Orders';
import { Inventory } from '@/screens/Inventory';
import { Manage } from '@/screens/Manage';
import { Onboarding } from '@/screens/Onboarding';

export function App() {
  return (
    // Hash routing keeps deep links working under file:// in the Tauri and
    // Capacitor shells, where there is no server to rewrite paths.
    <HashRouter>
      <HaseebProvider>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </HaseebProvider>
    </HashRouter>
  );
}

/**
 * Nothing renders until the encrypted database is open. Onboarding lives
 * outside the shell — a business that has not been registered yet has no
 * dashboard to show.
 */
function Gate() {
  const { status, error, retry, profile } = useHaseeb();
  const { account, ready, needsOwnerSetup } = useSession();

  if (status === 'opening') return <BootSkeleton />;

  if (status === 'error') {
    return (
      <div style={{ padding: 'var(--hs-sp-13)', maxWidth: 640, margin: '0 auto' }}>
        <ErrorState
          title="تعذّر فتح قاعدة البيانات المحلية"
          detail={error?.message ?? 'خطأ غير معروف'}
          action={
            <Button variant="primary" onClick={retry}>
              إعادة المحاولة
            </Button>
          }
        />
      </div>
    );
  }

  if (!profile?.onboardedAt) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  // Nothing behind the till is reachable without a session: no manager account
  // yet means set one up, and no signed-in user means sign in.
  if (!ready) return <BootSkeleton />;
  if (needsOwnerSetup) return <OwnerSetup />;
  if (!account) return <SignIn />;

  return (
    <AppShell>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAbility ability={requires('dashboard')}>
              <Dashboard />
            </RequireAbility>
          }
        />
        <Route
          path="/pos"
          element={
            <RequireAbility ability={requires('pos')}>
              <PointOfSale />
            </RequireAbility>
          }
        />
        <Route
          path="/finance"
          element={
            <RequireAbility ability={requires('finance')}>
              <Finance />
            </RequireAbility>
          }
        />
        <Route
          path="/wholesale"
          element={
            <RequireAbility ability={requires('wholesale')}>
              <Wholesale />
            </RequireAbility>
          }
        />
        <Route
          path="/debts"
          element={
            <RequireAbility ability={requires('debts')}>
              <Debts />
            </RequireAbility>
          }
        />
        <Route
          path="/orders"
          element={
            <RequireAbility ability={requires('orders')}>
              <Orders />
            </RequireAbility>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequireAbility ability={requires('inventory')}>
              <Inventory />
            </RequireAbility>
          }
        />
        <Route
          path="/manage"
          element={
            <RequireAbility ability={requires('manage')}>
              <Manage />
            </RequireAbility>
          }
        />
        {/* Reachable after registration too — it is also the place to correct
            the name, tax number or VAT rate that print on every invoice. */}
        <Route
          path="/onboarding"
          element={
            <RequireAbility ability="staff.manage">
              <Onboarding />
            </RequireAbility>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

/**
 * The ability a route needs, read from the same list that builds the
 * navigation — so a screen's link and its route cannot drift apart and offer
 * a user a destination that then bounces them away.
 */
function requires(id: string): Ability {
  const screen = SCREENS.find((s) => s.id === id);
  if (!screen) throw new Error(`unknown screen ${id}`);
  return screen.requires;
}

function BootSkeleton() {
  return (
    <div style={{ padding: 'var(--hs-sp-11)' }} aria-busy="true" aria-live="polite">
      <span className="hs-sr-only">جارٍ فتح قاعدة البيانات المحلية…</span>
      <AutoGrid min={196} style={{ marginBlockEnd: 'var(--hs-gap)' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </AutoGrid>
      <AutoGrid min={320}>
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
      </AutoGrid>
    </div>
  );
}

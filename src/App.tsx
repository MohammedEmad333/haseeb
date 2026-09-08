import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HaseebProvider, useHaseeb } from '@/state/HaseebProvider';
import { AppShell } from '@/shell/AppShell';
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
        <Gate />
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

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pos" element={<PointOfSale />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/wholesale" element={<Wholesale />} />
        <Route path="/debts" element={<Debts />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/manage" element={<Manage />} />
        {/* Reachable after registration too — it is also the place to correct
            the name, tax number or VAT rate that print on every invoice. */}
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
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

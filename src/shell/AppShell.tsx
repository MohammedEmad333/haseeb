/**
 * The application chrome.
 *
 * Desktop and web get the sidebar rail on the right (the RTL leading edge);
 * below 900px the rail becomes a drawer and a bottom tab bar with the new-sale
 * FAB takes over, which is the mobile layout the design specifies.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SCREENS, MOBILE_TABS } from './screens';
import { useHaseeb } from '@/state/HaseebProvider';
import { Meter, cx } from '@/ui/primitives';
import { initial, num } from '@/lib/format';
import './shell.css';

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // A route change closes the drawer; leaving it open across a navigation is
  // the classic mobile-nav bug.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="hs-shell">
      <TopBar onMenu={() => setDrawerOpen(true)} />
      <div className="hs-body">
        <Sidebar />
        <main className="hs-main" id="main">
          {children}
        </main>
      </div>
      <MobileTabBar onMore={() => setDrawerOpen(true)} />
      <NewSaleFab />
      {drawerOpen ? <NavDrawer onClose={() => setDrawerOpen(false)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { profile, search, setSearch, syncPending } = useHaseeb();
  const navigate = useNavigate();

  return (
    <header className="hs-topbar">
      <button className="hs-topbar__menu" onClick={onMenu} aria-label="فتح القائمة" type="button">
        <span />
        <span />
        <span />
      </button>

      <div className="hs-topbar__brand">
        <span className="hs-topbar__mark">
          <img src="./assets/haseeb-icon.png" alt="" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="hs-topbar__name">حسيب</div>
          <div className="hs-topbar__tagline">حساباتك بدقة.. وأمان.</div>
        </div>
      </div>

      <div className="hs-topbar__search">
        <form
          className="hs-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate('/pos');
          }}
        >
          <span className="hs-search__glyph" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث عن فاتورة، عميل، أو صنف…"
            aria-label="بحث"
          />
        </form>
      </div>

      <div className="hs-row" style={{ gap: 'var(--hs-sp-6)' }}>
        <span
          className={cx('hs-syncpill', syncPending > 0 && 'hs-syncpill--queued')}
          title={
            syncPending > 0
              ? `${num(syncPending)} عملية بانتظار المزامنة المشفّرة`
              : 'كل العمليات محفوظة محلياً'
          }
        >
          <span className="hs-syncpill__dot" aria-hidden />
          <span>
            {syncPending > 0 ? `${num(syncPending)} بانتظار المزامنة` : 'قاعدة محلية · مزامنة مشفّرة'}
          </span>
        </span>

        <div className="hs-topbar__user">
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 500 }}>
              {profile?.name ?? 'حسيب'}
            </div>
            <div style={{ fontSize: 'var(--hs-fs-micro)', color: 'var(--hs-on-dark-subtle)' }}>
              مدير النظام
            </div>
          </div>
          <span className="hs-topbar__avatar" aria-hidden>
            {initial(profile?.name ?? 'حسيب')}
          </span>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {SCREENS.map((screen) => (
        <NavLink
          key={screen.id}
          to={screen.path}
          end={screen.path === '/'}
          onClick={onNavigate}
          className={({ isActive }) => cx('hs-navitem', isActive && 'hs-navitem--active')}
        >
          {({ isActive }) => (
            <>
              <span
                className="hs-navitem__dot"
                style={isActive ? { background: screen.dot } : undefined}
                aria-hidden
              />
              <span>{screen.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

function Sidebar() {
  return (
    <nav className="hs-sidebar" aria-label="الشاشات">
      <div className="hs-sidebar__label">الشاشات</div>
      <NavItems />
      <div style={{ flex: 1 }} />
      <StorageCard />
    </nav>
  );
}

function StorageCard() {
  const { storageLocation, storageUsedBytes } = useHaseeb();
  // The quota the design shows is 3.2 GB; the fill is what the database
  // actually occupies, so the card reports reality rather than a mock bar.
  const quota = 3.2 * 1024 ** 3;
  const used = storageUsedBytes;
  // Report in the unit that actually says something: "٠٫٠ غيغابايت" tells the
  // owner nothing about a database that is a few hundred kilobytes.
  const size = (bytes: number): string => {
    if (bytes < 1024 ** 2) return `${num(Math.max(1, Math.round(bytes / 1024)))} كيلوبايت`;
    if (bytes < 1024 ** 3) return `${num(Math.round((bytes / 1024 ** 2) * 10) / 10, 1)} ميغابايت`;
    return `${num(Math.round((bytes / 1024 ** 3) * 10) / 10, 1)} غيغابايت`;
  };

  return (
    <div className="hs-storagecard hs-on-dark">
      <div style={{ fontSize: 'var(--hs-fs-label)', fontWeight: 600, color: 'var(--hs-on-dark)', marginBlockEnd: 6 }}>
        التخزين المحلي
      </div>
      <div style={{ fontSize: 'var(--hs-fs-badge)', lineHeight: 1.7 }}>
        قاعدة بيانات محلية على الجوال والويب وسطح المكتب — تعمل دون إنترنت.
      </div>
      <div style={{ marginBlockStart: 10 }}>
        <Meter value={used / quota} color="var(--hs-mint)" height={5} onDark label="مساحة التخزين" />
      </div>
      <div style={{ fontSize: 'var(--hs-fs-micro)', color: 'var(--hs-on-dark-subtle)', marginBlockStart: 6 }}>
        {size(used)} من {size(quota)} مستخدمة
      </div>
      <div
        style={{ fontSize: 'var(--hs-fs-micro)', color: 'var(--hs-on-dark-subtle)', marginBlockStart: 4, opacity: 0.8 }}
        title={storageLocation}
      >
        {storageLocation}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MobileTabBar({ onMore }: { onMore: () => void }) {
  const location = useLocation();
  const tabs = MOBILE_TABS.map((id) => SCREENS.find((s) => s.id === id)!);

  return (
    <nav className="hs-tabbar" aria-label="التنقل السريع">
      <div className="hs-tabbar__inner">
        {tabs.map((screen) => {
          const active =
            screen.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(screen.path);
          return (
            <NavLink
              key={screen.id}
              to={screen.path}
              className={cx('hs-tabbar__item', active && 'hs-tabbar__item--active')}
            >
              <span className="hs-tabbar__dot" style={active ? { background: screen.dot } : undefined} aria-hidden />
              {screen.short}
            </NavLink>
          );
        })}
        <button type="button" className="hs-tabbar__item" onClick={onMore}>
          <span className="hs-tabbar__dot" aria-hidden />
          المزيد
        </button>
      </div>
    </nav>
  );
}

function NewSaleFab() {
  const navigate = useNavigate();
  return (
    <button type="button" className="hs-fab" onClick={() => navigate('/pos')} aria-label="بيع جديد">
      <span aria-hidden>+</span>
    </button>
  );
}

function NavDrawer({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus moves into the drawer on open and Escape closes it, so the drawer
  // is usable from the keyboard and does not strand a screen reader behind it.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="hs-drawer__scrim" onClick={onClose} />
      <div className="hs-drawer" role="dialog" aria-modal="true" aria-label="الشاشات" ref={ref}>
        <div className="hs-row" style={{ justifyContent: 'space-between', marginBlockEnd: 'var(--hs-sp-5)' }}>
          <span className="hs-sidebar__label" style={{ padding: 0 }}>
            الشاشات
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              border: '1px solid var(--hs-border)',
              background: 'var(--hs-surface)',
              borderRadius: 'var(--hs-r-control)',
              width: 36,
              height: 36,
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <NavItems onNavigate={onClose} />
        <div style={{ flex: 1 }} />
        <StorageCard />
      </div>
    </>
  );
}

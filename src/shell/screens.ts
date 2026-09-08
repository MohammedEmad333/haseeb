/** The app's routes, their Arabic labels and their accent colours. */

export interface ScreenDef {
  id: string;
  path: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  dot: string;
}

export const SCREENS: readonly ScreenDef[] = [
  { id: 'dashboard', path: '/', label: 'لوحة التحكم', short: 'الرئيسية', dot: '#059669' },
  { id: 'pos', path: '/pos', label: 'البيع المباشر', short: 'البيع', dot: '#10B981' },
  { id: 'finance', path: '/finance', label: 'الفواتير والأرباح', short: 'الفواتير', dot: '#059669' },
  { id: 'wholesale', path: '/wholesale', label: 'بيع الجملة', short: 'الجملة', dot: '#0EA5A0' },
  { id: 'debts', path: '/debts', label: 'دفتر الديون', short: 'الديون', dot: '#DC2626' },
  { id: 'orders', path: '/orders', label: 'الطلبات والفواتير', short: 'الطلبات', dot: '#F59E0B' },
  { id: 'inventory', path: '/inventory', label: 'المخزن', short: 'المخزن', dot: '#475569' },
  { id: 'manage', path: '/manage', label: 'الإدارة العامة', short: 'الإدارة', dot: '#0F172A' },
];

/** The five destinations on the mobile tab bar; «المزيد» opens the drawer. */
export const MOBILE_TABS = ['dashboard', 'pos', 'debts', 'inventory'] as const;

/** The app's routes, their Arabic labels, accent colours and required ability. */

import type { Ability } from '@/domain/abilities';

export interface ScreenDef {
  id: string;
  path: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  dot: string;
  /**
   * The ability a user needs to open this screen. A user without it does not
   * see the screen in the navigation and cannot reach it by typing the URL.
   */
  requires: Ability;
}

export const SCREENS: readonly ScreenDef[] = [
  { id: 'dashboard', path: '/', label: 'لوحة التحكم', short: 'الرئيسية', dot: '#059669', requires: 'finance.read' },
  { id: 'pos', path: '/pos', label: 'البيع المباشر', short: 'البيع', dot: '#10B981', requires: 'pos.sell' },
  { id: 'finance', path: '/finance', label: 'الفواتير والأرباح', short: 'الفواتير', dot: '#059669', requires: 'finance.read' },
  { id: 'wholesale', path: '/wholesale', label: 'بيع الجملة', short: 'الجملة', dot: '#0EA5A0', requires: 'wholesale.write' },
  { id: 'debts', path: '/debts', label: 'دفتر الديون', short: 'الديون', dot: '#DC2626', requires: 'debts.read' },
  { id: 'orders', path: '/orders', label: 'الطلبات والفواتير', short: 'الطلبات', dot: '#F59E0B', requires: 'orders.read' },
  { id: 'inventory', path: '/inventory', label: 'المخزن', short: 'المخزن', dot: '#475569', requires: 'inventory.read' },
  // Opening this screen needs the financial reading; the cards inside it —
  // users, data transfer, reset — each guard their own ability.
  { id: 'manage', path: '/manage', label: 'الإدارة العامة', short: 'الإدارة', dot: '#0F172A', requires: 'finance.read' },
];

/** The five destinations on the mobile tab bar; «المزيد» opens the drawer. */
export const MOBILE_TABS = ['dashboard', 'pos', 'debts', 'inventory'] as const;

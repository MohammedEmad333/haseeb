/**
 * What a signed-in user is allowed to do.
 *
 * Abilities are the vocabulary; the roles below are the presets a shop
 * actually hires for. Every guard in the app names an ability, never a role,
 * so a shop can give the accountant stock access without inventing a new role.
 */

export const ABILITIES = [
  'pos.sell',
  'pos.credit',
  'inventory.read',
  'inventory.write',
  'wholesale.write',
  'debts.read',
  'debts.collect',
  'orders.read',
  'orders.receive',
  'finance.read',
  'invoices.write',
  'staff.manage',
  'data.export',
  'data.reset',
] as const;

export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABEL: Record<Ability, string> = {
  'pos.sell': 'البيع المباشر',
  'pos.credit': 'البيع الآجل (تسجيل دين)',
  'inventory.read': 'عرض المخزن',
  'inventory.write': 'تعديل المخزن والتوريد',
  'wholesale.write': 'إصدار فواتير الجملة',
  'debts.read': 'عرض دفتر الديون',
  'debts.collect': 'تحصيل السدادات',
  'orders.read': 'عرض الطلبات',
  'orders.receive': 'استلام أوامر التوريد',
  'finance.read': 'التقارير المالية والأرباح',
  'invoices.write': 'إصدار الفواتير الضريبية',
  'staff.manage': 'إدارة المستخدمين والصلاحيات',
  'data.export': 'تصدير واستيراد البيانات',
  'data.reset': 'إعادة ضبط قاعدة البيانات',
};

/** Ready-made bundles matching the roles the design's staff list names. */
export const ROLE_PRESETS: Record<string, { label: string; abilities: Ability[] }> = {
  owner: {
    label: 'مالك / مدير',
    abilities: [...ABILITIES],
  },
  cashier: {
    label: 'كاشير',
    abilities: ['pos.sell', 'pos.credit', 'inventory.read', 'orders.read'],
  },
  storekeeper: {
    label: 'أمين مخزن',
    abilities: ['inventory.read', 'inventory.write', 'orders.read', 'orders.receive'],
  },
  accountant: {
    label: 'محاسب',
    abilities: ['finance.read', 'invoices.write', 'debts.read', 'debts.collect', 'orders.read'],
  },
  wholesaleRep: {
    label: 'مندوب جملة',
    abilities: ['wholesale.write', 'inventory.read', 'debts.read', 'orders.read'],
  },
};

export type RoleKey = keyof typeof ROLE_PRESETS;

/**
 * The owner is not a bundle of abilities that could be edited away — it is a
 * standing grant. A shop that could lock itself out of its own books by
 * unticking a box is a shop that will.
 */
export function abilitiesFor(isOwner: boolean, granted: readonly string[]): Set<Ability> {
  if (isOwner) return new Set(ABILITIES);
  return new Set(granted.filter(isAbility));
}

export function isAbility(value: string): value is Ability {
  return (ABILITIES as readonly string[]).includes(value);
}

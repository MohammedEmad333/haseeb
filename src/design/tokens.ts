/**
 * TypeScript mirror of `src/styles/tokens.css`.
 *
 * Components should prefer the CSS custom properties; this module exists for
 * the places where a colour has to reach JavaScript — SVG chart strokes,
 * conic-gradient strings, and the per-screen accent used by the navigation.
 */

export const color = {
  ink: '#0F172A',
  ink2: '#1E293B',
  brandNavy: '#1E3A67',

  emerald: '#059669',
  emeraldDark: '#047857',
  emeraldDeep: '#065F46',
  mint: '#10B981',
  mintLight: '#34D399',
  mintBg: '#ECFDF5',
  mintBorder: '#A7F3D0',
  mintText: '#047857',
  onMint: '#04241A',
  teal: '#0EA5A0',

  page: '#EEF2F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E2E8F0',
  borderCard: '#E7ECF2',
  divider: '#F1F5F9',

  text: '#0F172A',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
  textSlate: '#475569',
  textSlate2: '#334155',
  textDim: '#CBD5E1',

  warnBg: '#FFFBEB',
  warnBorder: '#FDE68A',
  warnText: '#92400E',
  warnSolid: '#F59E0B',
  warnStrong: '#B45309',

  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#B91C1C',
  dangerSolid: '#DC2626',
  dangerDeep: '#991B1B',

  navActive: '#EAF2EE',
} as const;

/** Semantic tint triples, used by badges and tinted stat cards. */
export const tint = {
  success: { bg: color.mintBg, border: color.mintBorder, fg: color.mintText },
  warning: { bg: color.warnBg, border: color.warnBorder, fg: color.warnText },
  danger: { bg: color.dangerBg, border: color.dangerBorder, fg: color.dangerText },
  neutral: { bg: color.page, border: color.border, fg: color.textSlate2 },
  plain: { bg: color.surface, border: color.borderCard, fg: color.ink },
} as const;

export type TintName = keyof typeof tint;

export const shadow = {
  card: '0 1px 2px rgba(15,23,42,.04), 0 10px 26px -16px rgba(15,23,42,.18)',
  raised: '0 18px 40px -26px rgba(15,23,42,.4)',
  modal: '0 1px 2px rgba(15,23,42,.04), 0 24px 50px -32px rgba(15,23,42,.45)',
  darkButton: '0 8px 20px -10px rgba(15,23,42,.7)',
  greenButton: '0 8px 18px -10px rgba(5,150,105,.9)',
  fab: '0 16px 30px -12px rgba(5,150,105,.95)',
} as const;

export const motion = '160ms ease';

/**
 * Locale-aware formatting for the Arabic UI.
 *
 * Every digit the user sees goes through here. The design samples use
 * Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩); which numbering system is actually
 * rendered is a runtime setting (`setNumberingSystem`) rather than a literal
 * baked into a component, so the same build serves `arab` and `latn` markets.
 */

export type NumberingSystem = 'arab' | 'latn';

const LOCALE = 'ar-EG';

let numbering: NumberingSystem = 'latn';

export function setNumberingSystem(system: NumberingSystem): void {
  numbering = system;
  cache.clear();
}

export function getNumberingSystem(): NumberingSystem {
  return numbering;
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = numbering + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(`${LOCALE}-u-nu-${numbering}`, options);
    cache.set(key, f);
  }
  return f;
}

/** Plain integer, grouped: 48200 → «٤٨,٢٠٠». */
export function num(value: number, fractionDigits = 0): string {
  return formatter({
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Piaster amount as a two-decimal money string: 52720 → «٥٢٧.٢٠». */
export function money(piasters: number, fractionDigits = 2): string {
  return num(piasters / 100, fractionDigits);
}

/** Piaster amount rounded to whole pounds, for KPI tiles: 4820000 → «٤٨,٢٠٠». */
export function moneyRounded(piasters: number): string {
  return num(Math.round(piasters / 100), 0);
}

/** «48.2K» / «٤٨٫٢ك» — the compact form used in the donut hole. */
export function moneyCompact(piasters: number): string {
  const pounds = piasters / 100;
  const thousands = numbering === 'arab' ? 'ك' : 'K';
  if (Math.abs(pounds) >= 1000) return `${num(Math.round(pounds / 100) / 10, 1)}${thousands}`;
  return num(Math.round(pounds), 0);
}

/** Ungrouped integer — years, and anything where a thousands separator would
    be wrong. */
export function plainNum(value: number): string {
  return formatter({ useGrouping: false, maximumFractionDigits: 0 }).format(value);
}

/** The percent sign that matches the active numbering system. */
function percentSign(): string {
  return numbering === 'arab' ? '٪' : '%';
}

/** «24%» / «٢٤٪» */
export function percent(value: number, fractionDigits = 0): string {
  return `${num(value, fractionDigits)}${percentSign()}`;
}

/** Signed delta badge text: 12 → «+12%», -4 → «−4%» (U+2212 minus). */
export function signedPercent(value: number, fractionDigits = 0): string {
  const sign = value < 0 ? '−' : '+';
  return `${sign}${num(Math.abs(value), fractionDigits)}${percentSign()}`;
}

/** Signed integer for stock deltas: 60 → «+٦٠», -5 → «−٥». */
export function signedNum(value: number): string {
  const sign = value < 0 ? '−' : '+';
  return `${sign}${num(Math.abs(value))}`;
}

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function pad(value: number): string {
  return plainNum(value).padStart(2, plainNum(0));
}

/** «٢٠٢٦/٠٩/٠٨» — the invoice-table date form. */
export function dateFull(iso: string): string {
  const d = new Date(iso);
  return `${plainNum(d.getFullYear())}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** «٠٨/٠٩» — the compact day/month form used in lists and timelines. */
export function dateShort(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** «٠٩:٤١» */
export function timeShort(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «٠٩:٤١ · ٠٨/٠٩» — the sales-log stamp. */
export function timeAndDate(iso: string): string {
  return `${timeShort(iso)} · ${dateShort(iso)}`;
}

/** «٠٨/٠٩ ٠٩:٤١» — the audit / movement stamp. */
export function dateAndTime(iso: string): string {
  return `${dateShort(iso)} ${timeShort(iso)}`;
}

/** «٨ سبتمبر ٢٠٢٦» — the dashboard sub-line. */
export function dateLong(iso: string): string {
  const d = new Date(iso);
  return `${num(d.getDate())} ${MONTHS_AR[d.getMonth()]} ${plainNum(d.getFullYear())}`;
}

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Transliterate the digits inside an identifier — a phone number, a tax
 * registration, a commercial register number — into the active numbering
 * system.
 *
 * These are strings, not quantities: they can carry leading zeros and have no
 * magnitude, so they must not go through a number formatter. Non-digit
 * characters (spaces, `+`, dashes) are left alone.
 */
export function digits(value: string): string {
  if (numbering === 'latn') return value;
  return value.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/**
 * Arabic noun agreement.
 *
 * Arabic does not have one plural: 1 takes the singular, 2 takes the dual,
 * 3–10 take the plural, and 11+ take an accusative singular. Writing
 * «١ أصناف» the way an English-shaped template would is simply wrong, and a
 * shopkeeper reads it as sloppy software.
 */
export interface ArabicForms {
  /** صنف — used for 1 and, with «لا», for 0. */
  one: string;
  /** صنفان — the dual. */
  two: string;
  /** أصناف — 3 to 10. */
  few: string;
  /** صنفاً — 11 and above. */
  many: string;
}

const pluralRules = new Intl.PluralRules('ar-EG');

/** «٣ أصناف» · «صنف واحد» · «١٤ صنفاً» */
export function counted(value: number, forms: ArabicForms): string {
  const category = pluralRules.select(value);
  switch (category) {
    case 'zero':
      return `لا ${forms.few}`;
    case 'one':
      return `${forms.one} واحد`;
    case 'two':
      return forms.two;
    case 'few':
      return `${num(value)} ${forms.few}`;
    default:
      return `${num(value)} ${forms.many}`;
  }
}

/** The noun forms this app needs. */
export const NOUNS = {
  item: { one: 'صنف', two: 'صنفان', few: 'أصناف', many: 'صنفاً' },
  customer: { one: 'عميل', two: 'عميلان', few: 'عملاء', many: 'عميلاً' },
  supplier: { one: 'مورد', two: 'موردان', few: 'موردون', many: 'مورداً' },
  invoice: { one: 'فاتورة', two: 'فاتورتان', few: 'فواتير', many: 'فاتورة' },
  payment: { one: 'سداد', two: 'سدادان', few: 'سدادات', many: 'سداداً' },
  order: { one: 'طلب', two: 'طلبان', few: 'طلبات', many: 'طلباً' },
  operation: { one: 'عملية', two: 'عمليتان', few: 'عمليات', many: 'عملية' },
  day: { one: 'يوم', two: 'يومان', few: 'أيام', many: 'يوماً' },
  unit: { one: 'وحدة', two: 'وحدتان', few: 'وحدات', many: 'وحدة' },
} as const satisfies Record<string, ArabicForms>;

/** First letter of a name, for avatar tiles. */
export function initial(name: string): string {
  return Array.from(name.trim())[0] ?? '؟';
}

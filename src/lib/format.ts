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

let numbering: NumberingSystem = 'arab';

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

/** «٤٨.٢ك» — the compact form used in the donut hole. */
export function moneyCompact(piasters: number): string {
  const pounds = piasters / 100;
  if (Math.abs(pounds) >= 1000) return `${num(Math.round(pounds / 100) / 10, 1)}ك`;
  return num(Math.round(pounds), 0);
}

/** Ungrouped integer — years, and anything where a thousands separator would
    be wrong. */
export function plainNum(value: number): string {
  return formatter({ useGrouping: false, maximumFractionDigits: 0 }).format(value);
}

/** «٢٤٪» */
export function percent(value: number, fractionDigits = 0): string {
  return `${num(value, fractionDigits)}٪`;
}

/** Signed delta badge text: 12 → «+١٢٪», -4 → «−٤٪» (U+2212 minus). */
export function signedPercent(value: number, fractionDigits = 0): string {
  const sign = value < 0 ? '−' : '+';
  return `${sign}${num(Math.abs(value), fractionDigits)}٪`;
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

/** First letter of a name, for avatar tiles. */
export function initial(name: string): string {
  return Array.from(name.trim())[0] ?? '؟';
}

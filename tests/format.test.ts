import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NOUNS,
  counted,
  dateFull,
  dateLong,
  digits,
  dateShort,
  initial,
  money,
  moneyCompact,
  moneyRounded,
  num,
  percent,
  setNumberingSystem,
  signedNum,
  signedPercent,
  timeAndDate,
} from '@/lib/format';

beforeEach(() => setNumberingSystem('latn'));
afterEach(() => setNumberingSystem('latn'));

describe('formatting', () => {
  it('renders Latin digits by default', () => {
    expect(num(48_200)).toBe('48,200');
    expect(money(52_720)).toBe('527.20');
    expect(moneyRounded(4_820_000)).toBe('48,200');
  });

  it('switches numbering system at runtime rather than hard-coding digits', () => {
    setNumberingSystem('arab');
    expect(num(48_200)).toBe('٤٨٬٢٠٠');
    expect(money(52_720)).toBe('٥٢٧٫٢٠');
    setNumberingSystem('latn');
    expect(num(48_200)).toBe('48,200');
  });

  it('pairs the percent sign with the digits it sits beside', () => {
    // U+066A is drawn for Arabic-Indic numerals; against Latin ones it reads
    // as a typo.
    expect(percent(24)).toBe('24%');
    expect(signedPercent(-4)).toBe('−4%');
    setNumberingSystem('arab');
    expect(percent(24)).toBe('٢٤٪');
    expect(signedPercent(-4)).toBe('−٤٪');
  });

  it('signs deltas with a real minus sign, not a hyphen', () => {
    expect(signedPercent(12)).toBe('+12%');
    expect(signedNum(-5)).toBe('−5');
    expect(signedNum(60)).toBe('+60');
  });

  it('abbreviates thousands in the script of the active digits', () => {
    expect(moneyCompact(4_820_000)).toBe('48.2K');
    expect(moneyCompact(50_000)).toBe('500');
    setNumberingSystem('arab');
    expect(moneyCompact(4_820_000)).toBe('٤٨٫٢ك');
  });

  it('formats dates without a thousands separator in the year', () => {
    const iso = '2026-09-08T09:41:00';
    expect(dateFull(iso)).toBe('2026/09/08');
    expect(dateShort(iso)).toBe('08/09');
    expect(timeAndDate(iso)).toBe('09:41 · 08/09');
    expect(dateLong(iso)).toBe('8 سبتمبر 2026');

    setNumberingSystem('arab');
    expect(dateFull(iso)).toBe('٢٠٢٦/٠٩/٠٨');
    expect(dateLong(iso)).toBe('٨ سبتمبر ٢٠٢٦');
  });

  it('takes the first letter of an Arabic name for the avatar tile', () => {
    expect(initial('محمود عبد الله')).toBe('م');
    expect(initial('  ندى')).toBe('ن');
    expect(initial('')).toBe('؟');
  });
});

describe('Arabic noun agreement', () => {
  it('uses the singular, dual, plural and accusative forms correctly', () => {
    // Arabic has four shapes here, and "١ أصناف" is simply ungrammatical.
    expect(counted(0, NOUNS.item)).toBe('لا أصناف');
    expect(counted(1, NOUNS.item)).toBe('صنف واحد');
    expect(counted(2, NOUNS.item)).toBe('صنفان');
    expect(counted(4, NOUNS.item)).toBe('4 أصناف');
    expect(counted(14, NOUNS.item)).toBe('14 صنفاً');
    expect(counted(18, NOUNS.customer)).toBe('18 عميلاً');
    expect(counted(23, NOUNS.payment)).toBe('23 سداداً');
    expect(counted(4, NOUNS.supplier)).toBe('4 موردون');
  });
});

describe('identifier digits', () => {
  it('leaves identifiers alone under the Latin default', () => {
    expect(digits('01022223344')).toBe('01022223344');
    expect(digits('INV-2481')).toBe('INV-2481');
  });

  it('transliterates identifiers without treating them as numbers', () => {
    // Leading zeros and grouping must survive: a phone number is not a quantity.
    setNumberingSystem('arab');
    expect(digits('01022223344')).toBe('٠١٠٢٢٢٢٣٣٤٤');
    expect(digits('302199487')).toBe('٣٠٢١٩٩٤٨٧');
    expect(digits('+20 100 555 6677')).toBe('+٢٠ ١٠٠ ٥٥٥ ٦٦٧٧');
    expect(digits('INV-2481')).toBe('INV-٢٤٨١');
  });
});

describe('no digits are hard-coded in the UI', () => {
  it('keeps Arabic-Indic numerals out of component source', async () => {
    // A literal digit in a component bypasses the formatter, so the numbering
    // preference silently fails to apply to it — which is exactly how the
    // chart subtitle «آخر ٧ أيام» slipped through.
    const { readdir, readFile } = await import('node:fs/promises');
    const offenders: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        // The formatter owns the digit table; the seed and the settings toggle
        // legitimately spell numerals out.
        if (/format\.ts$|seed\.ts$|Manage\.tsx$/.test(full)) continue;

        const source = await readFile(full, 'utf8');
        source.split('\n').forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
          if (/[٠-٩]/.test(code)) offenders.push(`${full}:${i + 1} ${code.trim()}`);
        });
      }
    };

    await walk('src');
    expect(offenders).toEqual([]);
  });
});

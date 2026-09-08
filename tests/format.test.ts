import { afterEach, describe, expect, it } from 'vitest';
import {
  dateFull,
  dateLong,
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

afterEach(() => setNumberingSystem('arab'));

describe('formatting', () => {
  it('renders Arabic-Indic digits by default', () => {
    expect(num(48_200)).toBe('٤٨٬٢٠٠');
    expect(money(52_720)).toBe('٥٢٧٫٢٠');
    expect(moneyRounded(4_820_000)).toBe('٤٨٬٢٠٠');
  });

  it('switches numbering system at runtime rather than hard-coding digits', () => {
    setNumberingSystem('latn');
    expect(num(48_200)).toBe('48,200');
    expect(money(52_720)).toBe('527.20');
    setNumberingSystem('arab');
    expect(num(48_200)).toBe('٤٨٬٢٠٠');
  });

  it('signs deltas with a real minus sign, not a hyphen', () => {
    expect(signedPercent(12)).toBe('+١٢٪');
    expect(signedPercent(-4)).toBe('−٤٪');
    expect(signedNum(-5)).toBe('−٥');
    expect(signedNum(60)).toBe('+٦٠');
  });

  it('formats percentages and compact money', () => {
    expect(percent(24)).toBe('٢٤٪');
    expect(moneyCompact(4_820_000)).toBe('٤٨٫٢ك');
    expect(moneyCompact(50_000)).toBe('٥٠٠');
  });

  it('formats dates without a thousands separator in the year', () => {
    const iso = '2026-09-08T09:41:00';
    expect(dateFull(iso)).toBe('٢٠٢٦/٠٩/٠٨');
    expect(dateShort(iso)).toBe('٠٨/٠٩');
    expect(timeAndDate(iso)).toBe('٠٩:٤١ · ٠٨/٠٩');
    expect(dateLong(iso)).toBe('٨ سبتمبر ٢٠٢٦');
  });

  it('takes the first letter of an Arabic name for the avatar tile', () => {
    expect(initial('محمود عبد الله')).toBe('م');
    expect(initial('  ندى')).toBe('ن');
    expect(initial('')).toBe('؟');
  });
});

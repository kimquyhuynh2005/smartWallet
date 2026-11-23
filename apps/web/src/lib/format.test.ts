import { describe, expect, it } from 'vitest';
import { budgetState } from '@/ui/progress-bar';
import { categoryVisual } from '@/lib/categories';
import { formatCompact, formatMoney, parseMoneyInput, vnDayKey, relativeDay } from './format';

const NBSP = ' ';

describe('money formatting', () => {
  it('vi uses dots and the dong sign after the number', () => {
    expect(formatMoney(1_500_000, 'vi')).toBe(`1.500.000${NBSP}₫`);
  });
  it('en uses commas and VND', () => {
    expect(formatMoney(1_500_000, 'en')).toBe(`1,500,000${NBSP}VND`);
  });
  it('negative amounts use a real minus sign, never a hyphen', () => {
    expect(formatMoney(-350_000, 'vi')).toContain('−');
    expect(formatMoney(-350_000, 'vi')).not.toContain('-');
  });
  it('compact form', () => {
    expect(formatCompact(6_000_000, 'vi')).toMatch(/6\s?tr/);
    expect(formatCompact(6_000_000, 'en')).toMatch(/6\s?M/);
  });
  it('parses what people type (dots, commas, spaces, symbols)', () => {
    expect(parseMoneyInput('1.500.000')).toBe(1_500_000);
    expect(parseMoneyInput('1,500,000 ₫')).toBe(1_500_000);
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});

describe('Vietnam days', () => {
  it('23:30 UTC is already the next day in Asia/Ho_Chi_Minh', () => {
    expect(vnDayKey('2026-11-22T23:30:00Z')).toBe('2026-11-23');
  });
  it('relativeDay', () => {
    const now = new Date('2026-11-23T05:00:00Z');
    expect(relativeDay('2026-11-23T01:00:00Z', now)).toBe('today');
    expect(relativeDay('2026-11-22T05:00:00Z', now)).toBe('yesterday');
    expect(relativeDay('2026-11-10T05:00:00Z', now)).toBeNull();
  });
});

describe('budget state thresholds (same as the API alerts: 80 / 100)', () => {
  it.each([[0, 'calm'], [79.9, 'calm'], [80, 'warning'], [99.9, 'warning'], [100, 'over'], [140, 'over']] as const)('%s%% -> %s', (p, s) => {
    expect(budgetState(p)).toBe(s);
  });
});

describe('category visuals', () => {
  it('maps default categories to an icon and falls back for custom ones', () => {
    expect(categoryVisual({ nameEn: 'Food & Drinks' }).key).toBeTruthy();
    const custom = categoryVisual({ nameEn: 'Pets', color: '#6D8F5E' });
    expect(custom.color).toContain('#6D8F5E');
  });
});

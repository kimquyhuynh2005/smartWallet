// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { resetLang, setLang } from '@/test/lang';
import { AmountText } from './amount-text';

const NB = ' ';
/** visible text (what sighted users read) = the last span; sr-only text is separate */
const root = (c: HTMLElement) => c.firstElementChild as HTMLElement;
const visible = (c: HTMLElement) => (root(c).lastElementChild as HTMLElement).textContent!.replace(NB, '');
const sr = (c: HTMLElement) => [...root(c).querySelectorAll('.sr-only')].map((e) => e.textContent);

afterEach(() => resetLang());

describe('TC-FE-UI-AMT AmountText formatting', () => {
  it('TC-FE-UI-AMT-01 vi: 1.500.000 then the unit after the number', () => {
    const { container } = render(<AmountText amount={1_500_000} />);
    expect(visible(container)).toBe('1.500.000₫');
    expect(root(container).textContent!.indexOf('₫')).toBeGreaterThan(root(container).textContent!.indexOf('1.500.000'));
  });

  it('TC-FE-UI-AMT-02 en: 1,500,000 VND', () => {
    setLang('en');
    const { container } = render(<AmountText amount={1_500_000} />);
    expect(visible(container)).toBe('1,500,000VND');
  });

  it('TC-FE-UI-AMT-03 income shows + in the accent tone, with a spoken kind word', () => {
    const { container } = render(<AmountText amount={2_000_000} kind="income" />);
    expect(visible(container)).toBe('+2.000.000₫');
    expect(root(container)).toHaveClass('text-accent');
    expect(sr(container)).toEqual(['Thu nhập ']);
    expect(i18n.t('transactions.income')).toBe('Thu nhập');
  });

  it('TC-FE-UI-AMT-04 expense shows a real minus sign (U+2212), in ink, never red', () => {
    const { container } = render(<AmountText amount={50_000} kind="expense" />);
    expect(visible(container)).toBe('−50.000₫');
    expect(visible(container)).not.toContain('-');
    expect(root(container)).toHaveClass('text-ink');
    expect(root(container).className).not.toMatch(/danger|red/);
    expect(sr(container)).toEqual(['Chi tiêu ']);
  });

  it('TC-FE-UI-AMT-05 expense with an already negative number is still one minus (abs)', () => {
    const { container } = render(<AmountText amount={-50_000} kind="expense" />);
    expect(visible(container)).toBe('−50.000₫');
  });

  it('TC-FE-UI-AMT-06 transfer is neutral: no sign, secondary tone, spoken word', () => {
    const { container } = render(<AmountText amount={300_000} kind="transfer" />);
    expect(visible(container)).toBe('300.000₫');
    expect(root(container)).toHaveClass('text-ink-2');
    expect(sr(container)).toEqual(['Chuyển ví ']);
  });

  it('TC-FE-UI-AMT-07 balance: sign only when negative, no spoken word', () => {
    const pos = render(<AmountText amount={900_000} />);
    expect(visible(pos.container)).toBe('900.000₫');
    expect(sr(pos.container)).toEqual([]);
    const neg = render(<AmountText amount={-900_000} />);
    expect(visible(neg.container)).toBe('−900.000₫');
  });

  it('TC-FE-UI-AMT-08 zero has no sign', () => {
    const z = render(<AmountText amount={0} kind="income" />);
    expect(visible(z.container)).toBe('0₫');
  });

  it('TC-FE-UI-AMT-09 English spoken kind word and minus', () => {
    setLang('en');
    const { container } = render(<AmountText amount={50_000} kind="expense" />);
    expect(visible(container)).toBe('−50,000VND');
    expect(sr(container)).toEqual(['Spending ']);
  });

  it('TC-FE-UI-AMT-10 hideUnit drops the unit', () => {
    const { container } = render(<AmountText amount={1000} hideUnit />);
    expect(root(container).textContent).not.toContain('₫');
  });

  it('TC-FE-UI-AMT-11 sign is never colour-only: text carries + / minus for income / expense', () => {
    const a = render(<AmountText amount={10} kind="income" />);
    const b = render(<AmountText amount={10} kind="expense" />);
    expect(visible(a.container).startsWith('+')).toBe(true);
    expect(visible(b.container).startsWith('−')).toBe(true);
  });
});

describe('TC-FE-UI-AMT count-up', () => {
  const mm = window.matchMedia;
  beforeEach(() => { vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); window.matchMedia = mm; });

  const total = (c: HTMLElement) => root(c).textContent!;

  it('TC-FE-UI-AMT-12 first render shows the final value at once and no duplicated text in steady state', () => {
    const { container } = render(<AmountText amount={1_500_000} />);
    expect(visible(container)).toBe('1.500.000₫');
    expect(total(container).match(/1\.500\.000/g)).toHaveLength(1);
    expect(sr(container)).toEqual([]);
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });

  it('TC-FE-UI-AMT-13 a changed prop animates (~320 ms) and settles on the exact target', () => {
    const { container, rerender } = render(<AmountText amount={1_000_000} />);
    rerender(<AmountText amount={2_000_000} />);
    act(() => { vi.advanceTimersByTime(16); });
    const mid = Number(visible(container).replace(/\D/g, ''));
    expect(mid).toBeGreaterThan(1_000_000);
    expect(mid).toBeLessThan(2_000_000);
    // while animating the screen reader gets the final number once, the moving one is aria-hidden
    expect(sr(container).map((s) => s!.replace(NB, ' '))).toEqual(['2.000.000 ₫']);
    expect(root(container).querySelector('[aria-hidden="true"]')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(150); });
    const later = Number(visible(container).replace(/\D/g, ''));
    expect(later).toBeGreaterThanOrEqual(mid);
    expect(later).toBeLessThan(2_000_000);
    act(() => { vi.advanceTimersByTime(400); });
    expect(visible(container)).toBe('2.000.000₫');
    expect(sr(container)).toEqual([]);
    expect(total(container).match(/2\.000\.000/g)).toHaveLength(1);
  });

  it('TC-FE-UI-AMT-14 animated values are whole dong at every frame', () => {
    const { container, rerender } = render(<AmountText amount={0} />);
    rerender(<AmountText amount={999_999} />);
    for (let i = 0; i < 12; i++) {
      act(() => { vi.advanceTimersByTime(16); });
      expect(visible(container)).toMatch(/^\d{1,3}(\.\d{3})*₫$/);
    }
  });

  it('TC-FE-UI-AMT-15 prefers-reduced-motion shows the final value immediately', () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null })) as unknown as typeof window.matchMedia;
    const { container, rerender } = render(<AmountText amount={1_000_000} />);
    rerender(<AmountText amount={2_000_000} />);
    expect(visible(container)).toBe('2.000.000₫');
    expect(sr(container)).toEqual([]);
  });

  it('TC-FE-UI-AMT-16 expense count-up ends on the signed target', () => {
    const { container, rerender } = render(<AmountText amount={10_000} kind="expense" />);
    rerender(<AmountText amount={60_000} kind="expense" />);
    act(() => { vi.advanceTimersByTime(500); });
    expect(visible(container)).toBe('−60.000₫');
  });
});

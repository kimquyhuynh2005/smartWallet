// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLang, setLang } from '@/test/lang';
import { MoneyInput } from './money-input';

function Harness({ initial = null, max, spy }: { initial?: number | null; max?: number; spy?: (v: number | null) => void }) {
  const [v, setV] = useState<number | null>(initial);
  return <MoneyInput aria-label="Số tiền" value={v} max={max} onChange={(n) => { setV(n); spy?.(n); }} />;
}
const field = () => screen.getByLabelText('Số tiền') as HTMLInputElement;

afterEach(() => resetLang());

describe('TC-FE-UI-MONEY MoneyInput', () => {
  it('TC-FE-UI-MONEY-01 groups digits as you type (vi uses dots)', async () => {
    render(<Harness />);
    await userEvent.type(field(), '1500000');
    expect(field()).toHaveValue('1.500.000');
  });

  it('TC-FE-UI-MONEY-02 groups with commas and shows VND in English', async () => {
    setLang('en');
    render(<Harness />);
    await userEvent.type(field(), '1500000');
    expect(field()).toHaveValue('1,500,000');
    expect(screen.getByText('VND')).toBeInTheDocument();
  });

  it('TC-FE-UI-MONEY-03 shows the ₫ unit in Vietnamese', () => {
    render(<Harness initial={1000} />);
    expect(screen.getByText('₫')).toBeInTheDocument();
  });

  it('TC-FE-UI-MONEY-04 emits integers only (never a float / string)', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.type(field(), '1250');
    const values = spy.mock.calls.map((c) => c[0]);
    expect(values).toEqual([1, 12, 125, 1250]);
    expect(values.every((n) => Number.isInteger(n))).toBe(true);
  });

  it('TC-FE-UI-MONEY-05 rejects non-digits and decimal separators', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.type(field(), 'ab-12.5,x');
    expect(field()).toHaveValue('125'); // "." and "," are separators, never decimals
    expect(spy.mock.calls.every((c) => c[0] === null || Number.isInteger(c[0]))).toBe(true);
  });

  it('TC-FE-UI-MONEY-06 letters only -> empty (null), error path', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.type(field(), 'abc');
    expect(field()).toHaveValue('');
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it('TC-FE-UI-MONEY-07 pasting "1.250.000" yields 1250000', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.click(field());
    await userEvent.paste('1.250.000');
    expect(spy).toHaveBeenLastCalledWith(1_250_000);
    expect(field()).toHaveValue('1.250.000');
  });

  it('TC-FE-UI-MONEY-08 accepts a large value 1.250.000.000 exactly', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.type(field(), '1250000000');
    expect(spy).toHaveBeenLastCalledWith(1_250_000_000);
    expect(field()).toHaveValue('1.250.000.000');
  });

  it('TC-FE-UI-MONEY-09 clamps to max', async () => {
    const spy = vi.fn();
    render(<Harness max={5000} spy={spy} />);
    await userEvent.type(field(), '99999');
    expect(spy).toHaveBeenLastCalledWith(5000);
    expect(field()).toHaveValue('5.000');
  });

  it('TC-FE-UI-MONEY-10 numeric keypad on phones: inputMode numeric, text type', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('inputmode', 'numeric');
    expect(field()).toHaveAttribute('type', 'text');
  });

  it('TC-FE-UI-MONEY-11 clearing the field emits null', async () => {
    const spy = vi.fn();
    render(<Harness initial={1500} spy={spy} />);
    await userEvent.clear(field());
    expect(spy).toHaveBeenLastCalledWith(null);
    expect(field()).toHaveValue('');
  });

  it('TC-FE-UI-MONEY-12 caret stays next to the edited digit when a separator appears', async () => {
    render(<Harness initial={1500000} />); // "1.500.000"
    const el = field();
    await userEvent.type(el, '9', { initialSelectionStart: 3, initialSelectionEnd: 3 }); // "1.5|00.000" -> "1.59|00.000"
    expect(el).toHaveValue('15.900.000');
    // 3 digits (1,5,9) are left of the caret -> after "15.9"
    expect(el.selectionStart).toBe(4);
  });

  it('TC-FE-UI-MONEY-13 backspace in the middle keeps the caret on the same digit', async () => {
    render(<Harness initial={1500000} />);
    const el = field();
    await userEvent.type(el, '{Backspace}', { initialSelectionStart: 4, initialSelectionEnd: 4 }); // "1.50|0.000" -> digits 150000
    expect(el).toHaveValue('150.000');
    expect(el.selectionStart).toBe(2); // two digits (1,5) stay left of the caret
  });

  it('TC-FE-UI-MONEY-14 invalid flag sets aria-invalid', () => {
    render(<MoneyInput aria-label="Số tiền" value={null} onChange={() => undefined} invalid />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });
});

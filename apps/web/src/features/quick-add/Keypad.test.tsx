// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { Keypad } from './Keypad';

function Harness({ spy }: { spy?: (v: number | null) => void }) {
  const [v, setV] = useState<number | null>(null);
  return <><output aria-label="giá trị">{v === null ? 'null' : v}</output><Keypad value={v} onChange={(n) => { setV(n); spy?.(n); }} /></>;
}

describe('TC-FE-TXN-01 Keypad', () => {
  it('TC-FE-TXN-01-33 renders a labelled group with 0-9, 000 and backspace keys', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Bàn phím số' });
    expect(group).toBeInTheDocument();
    for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '000']) expect(screen.getByRole('button', { name: `Phím ${k}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa chữ số cuối' })).toBeInTheDocument();
  });

  it('TC-FE-TXN-01-34 tapping 4, 5, 000 gives the integer 45000; backspace removes a digit', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.click(screen.getByRole('button', { name: 'Phím 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Phím 5' }));
    await userEvent.click(screen.getByRole('button', { name: 'Phím 000' }));
    expect(screen.getByLabelText('giá trị')).toHaveTextContent('45000');
    await userEvent.click(screen.getByRole('button', { name: 'Xóa chữ số cuối' }));
    expect(screen.getByLabelText('giá trị')).toHaveTextContent('4500');
    expect(spy.mock.calls.every((c) => c[0] === null || Number.isInteger(c[0]))).toBe(true);
  });

  it('TC-FE-TXN-01-35 error path: backspace on empty and a leading 0 keep the value empty (never "0")', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Xóa chữ số cuối' }));
    expect(screen.getByLabelText('giá trị')).toHaveTextContent('null');
    await userEvent.click(screen.getByRole('button', { name: 'Phím 0' }));
    expect(screen.getByLabelText('giá trị')).toHaveTextContent('null');
  });

  it('TC-FE-TXN-01-36 keys are real buttons that never submit a form', () => {
    render(<Harness />);
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('type', 'button');
  });
});

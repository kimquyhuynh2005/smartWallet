// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetLang, setLang } from '@/test/lang';
import { budgetState, ProgressBar } from './progress-bar';

afterEach(() => resetLang());
const bar = () => screen.getByRole('progressbar', { name: 'Ăn uống' });
const fill = () => bar().firstElementChild as HTMLElement;
const status = (c: HTMLElement) => c.querySelector('p') as HTMLElement;

describe('TC-FE-BUD-04 budgetState thresholds', () => {
  it.each([[0, 'calm'], [79.9, 'calm'], [80, 'warning'], [99.9, 'warning'], [100, 'over'], [112, 'over']] as const)('TC-FE-BUD-04-01 %s%% -> %s', (p, s) => {
    expect(budgetState(p)).toBe(s);
  });
});

describe('TC-FE-BUD-04 ProgressBar', () => {
  it('TC-FE-BUD-04-02 79.9% is calm: whole percent floor in text and valuetext', () => {
    const { container } = render(<ProgressBar percent={79.9} label="Ăn uống" />);
    expect(bar()).toHaveAttribute('aria-valuetext', '79% · Đang ổn');
    expect(status(container)).toHaveTextContent('79%');
    expect(status(container)).toHaveTextContent('Đang ổn');
    expect(status(container)).toHaveClass('text-accent');
  });

  it('TC-FE-BUD-04-03 80% is warning: "Gần hết" with an icon', () => {
    const { container } = render(<ProgressBar percent={80} label="Ăn uống" />);
    expect(bar()).toHaveAttribute('aria-valuetext', '80% · Gần hết');
    expect(status(container)).toHaveTextContent('80%');
    expect(status(container)).toHaveTextContent('Gần hết');
    const icon = status(container).querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('TC-FE-BUD-04-04 99.9% stays warning and reads 99% (never rounds up to 100%)', () => {
    const { container } = render(<ProgressBar percent={99.9} label="Ăn uống" />);
    expect(bar()).toHaveAttribute('aria-valuetext', '99% · Gần hết');
    expect(status(container)).toHaveTextContent('99%');
    expect(status(container)).not.toHaveTextContent('100%');
    expect(status(container)).toHaveTextContent('Gần hết');
  });

  it('TC-FE-BUD-04-05 100% is over: "Vượt ngân sách" + icon', () => {
    const { container } = render(<ProgressBar percent={100} label="Ăn uống" />);
    expect(bar()).toHaveAttribute('aria-valuetext', '100% · Vượt ngân sách');
    expect(status(container)).toHaveTextContent('Vượt ngân sách');
    expect(status(container).querySelector('svg')).not.toBeNull();
    expect(status(container)).toHaveClass('text-danger');
  });

  it('TC-FE-BUD-04-06 112% is over; width clamps to 100, valuenow capped at 100, text keeps 112%', () => {
    const { container } = render(<ProgressBar percent={112} label="Ăn uống" />);
    expect(fill().style.width).toBe('100%');
    expect(bar()).toHaveAttribute('aria-valuenow', '100');
    expect(bar()).toHaveAttribute('aria-valuemax', '100');
    expect(bar()).toHaveAttribute('aria-valuetext', '112% · Vượt ngân sách');
    expect(status(container)).toHaveTextContent('112%');
  });

  it('TC-FE-BUD-04-07 width follows the percent below 100 and never goes negative', () => {
    const { rerender } = render(<ProgressBar percent={42.5} label="Ăn uống" />);
    expect(fill().style.width).toBe('42.5%');
    rerender(<ProgressBar percent={-5} label="Ăn uống" />);
    expect(fill().style.width).toBe('0%');
  });

  it('TC-FE-BUD-04-08 status never depends on colour alone: each state has icon and word', () => {
    for (const p of [10, 85, 130]) {
      const { container, unmount } = render(<ProgressBar percent={p} label="Ăn uống" />);
      expect(status(container).querySelector('svg')).not.toBeNull();
      const spans = status(container).querySelectorAll('span');
      expect(spans).toHaveLength(2);
      expect(spans[1].textContent).toMatch(/Đang ổn|Gần hết|Vượt ngân sách/);
      unmount();
    }
  });

  it('TC-FE-BUD-04-09 showStatus=false hides the status line but keeps the progressbar role', () => {
    const { container } = render(<ProgressBar percent={85} label="Ăn uống" showStatus={false} />);
    expect(status(container)).toBeNull();
    expect(bar()).toBeInTheDocument();
  });

  it('TC-FE-BUD-04-10 English words and decimal point', () => {
    setLang('en');
    render(<ProgressBar percent={85} label="Food" />);
    expect(screen.getByRole('progressbar', { name: 'Food' })).toHaveAttribute('aria-valuetext', '85% · Getting close');
  });
});

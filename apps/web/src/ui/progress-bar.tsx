import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatPercent } from '@/lib/format';
import { useLang } from '@/hooks/useLang';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

export type BudgetState = 'calm' | 'warning' | 'over';
/** calm below 80 %, warning from 80 %, over from 100 % (the same thresholds as the alert engine) */
export const budgetState = (percent: number): BudgetState => (percent >= 100 ? 'over' : percent >= 80 ? 'warning' : 'calm');

const STYLE: Record<BudgetState, { bar: string; text: string; Icon: typeof CircleCheck }> = {
  calm: { bar: 'bg-accent', text: 'text-accent', Icon: CircleCheck },
  warning: { bar: 'bg-warn', text: 'text-warn', Icon: TriangleAlert },
  over: { bar: 'bg-danger', text: 'text-danger', Icon: OctagonAlert },
};

interface Props {
  /** 0..n, may exceed 100 */
  percent: number;
  /** what the bar measures, for screen readers ("Ăn uống") */
  label: string;
  /** set false when the surrounding row already prints the numbers */
  showStatus?: boolean;
  className?: string;
}

/**
 * Budget progress. Three states, and every state has an icon AND a word, so it never depends on color alone:
 *   calm (< 80 %)  ·  warning (80-99 %, amber, triangle, "Gần hết")  ·  over (>= 100 %, red, octagon, "Vượt ngân sách").
 */
export function ProgressBar({ percent, label, showStatus = true, className }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const shown = useCountUp(percent, { duration: 400 }).value;
  const state = budgetState(percent);
  const { bar, text, Icon } = STYLE[state];
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(percent, 100))}
        aria-valuetext={`${formatPercent(Math.floor(percent), lang)} · ${t(`budgets.${state}`)}`}
        className="h-2 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-[400ms] ease-out motion-reduce:transition-none', bar)} style={{ width: `${width}%` }} />
      </div>
      {showStatus && (
        <p className={cn('flex items-center gap-1.5 text-sm font-medium', text)}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="num">{formatPercent(Math.floor(shown), lang)}</span>
          <span>{t(`budgets.${state}`)}</span>
        </p>
      )}
    </div>
  );
}

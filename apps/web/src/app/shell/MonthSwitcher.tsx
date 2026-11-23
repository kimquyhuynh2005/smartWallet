import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePeriod } from '@/hooks/usePeriod';
import { cn } from '@/lib/utils';

const arrow = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35';

/** Top-bar month switcher. The chosen period is read by every screen through usePeriod(). */
export function MonthSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const p = usePeriod();
  return (
    <div role="group" aria-label={t('nav.month')} className={cn('flex items-center', className)}>
      <button type="button" className={arrow} onClick={p.prev} aria-label={t('nav.prevMonth')}><ChevronLeft className="h-5 w-5" aria-hidden /></button>
      <button
        type="button" onClick={p.reset} disabled={p.isCurrent} title={p.isCurrent ? undefined : t('nav.currentMonth')} aria-label={p.isCurrent ? undefined : `${p.label}. ${t('nav.currentMonth')}`}
        className="num min-h-11 min-w-[7.5rem] whitespace-nowrap rounded-md px-2 text-center text-base font-medium text-ink enabled:hover:bg-sunken disabled:cursor-default" aria-live="polite"
      >{p.label}</button>
      <button type="button" className={arrow} onClick={p.next} disabled={p.isCurrent} aria-label={t('nav.nextMonth')}><ChevronRight className="h-5 w-5" aria-hidden /></button>
    </div>
  );
}

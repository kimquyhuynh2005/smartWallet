import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';
import { useInView, useReducedMotion } from '@/hooks/useReducedMotion';
import { formatMoney } from '@/lib/format';
import { AmountText, Button, Card, CategoryIcon, ProgressBar } from '@/ui';

const LIMIT = 1_500_000, BEFORE = 1_190_000, PRICE = 65_000, DAYS = 9;
const FOOD = { nameEn: 'Food & Drinks', nameVi: 'Ăn uống', type: 'EXPENSE' as const };

/**
 * The product, running: a coffee is logged, the Food budget crosses 80 %, the warning slides in.
 * Built from the real Card / ProgressBar / AmountText / CategoryIcon with fixed demo numbers (the page is public: no API call).
 * Plays once when scrolled into view and can be replayed; with reduced motion it shows the end state.
 */
export function LivePreview() {
  const { t } = useTranslation();
  const lang = useLang();
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const [phase, setPhase] = useState(0); // 0 start, 1 transaction in, 2 bar crosses 80 %, 3 warning
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setPhase(0);
    timers.current = [setTimeout(() => setPhase(1), 900), setTimeout(() => setPhase(2), 1900), setTimeout(() => setPhase(3), 2900)];
  }, []);
  useEffect(() => {
    if (reduced) setPhase(3);
    else if (seen) play();
    return () => timers.current.forEach(clearTimeout);
  }, [reduced, seen, play]);

  const spent = phase >= 2 ? BEFORE + PRICE : BEFORE;
  const pct = (spent / LIMIT) * 100;
  const safe = Math.floor((LIMIT - spent) / DAYS);
  return (
    <div ref={ref} className="relative" role="group" aria-label={t('landing.preview.label')}>
      <Card className="flex flex-col gap-5 p-5 md:p-6">
        <div>
          <p className="eyebrow">{t('landing.preview.safeToday')}</p>
          <div className="mt-1"><AmountText amount={safe} size="hero" /></div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <CategoryIcon category={FOOD} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-ink">{t('landing.preview.budget')}</p>
              <p className="num text-sm text-ink-2">{t('landing.preview.usedOf', { spent: formatMoney(spent, lang), limit: formatMoney(LIMIT, lang) })}</p>
            </div>
          </div>
          <ProgressBar percent={pct} label={t('landing.preview.budget')} />
        </div>
        <ul className="min-h-[3.75rem] divide-y divide-line border-t border-line" aria-live="polite">
          {phase >= 1 && (
            <li className={`flex items-center gap-3 py-3 ${reduced ? '' : 'animate-rise-in'}`}>
              <CategoryIcon category={FOOD} size="sm" />
              <div className="min-w-0 flex-1"><p className="truncate text-base font-medium text-ink">{t('landing.preview.txnNote')}</p><p className="truncate text-sm text-ink-2">{t('landing.preview.txnMeta')}</p></div>
              <AmountText amount={PRICE} kind="expense" />
            </li>
          )}
        </ul>
      </Card>

      {/* the warning exactly as the app shows it: icon + text, sliding up over the corner of the card */}
      <div className="mt-3 min-h-[4.5rem] md:absolute md:-bottom-12 md:-left-8 md:right-10 md:mt-0 lg:-left-14" aria-live="polite">
        {phase >= 3 && (
          <div role="status" className={`flex items-start gap-3 rounded-lg border border-warn/40 bg-surface p-4 shadow-float ${reduced ? '' : 'animate-toast-in'}`}>
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
            <div>
              <p className="text-base font-semibold text-ink">{t('landing.preview.toastTitle', { pct: Math.floor(pct) })}</p>
              <p className="num text-sm text-ink-2">{t('landing.preview.toastBody', { left: formatMoney(LIMIT - spent, lang), days: DAYS })}</p>
            </div>
          </div>
        )}
      </div>
      {!reduced && phase === 3 && (
        <Button variant="ghost" size="sm" className="mt-2 md:absolute md:-top-12 md:right-0 md:mt-0" onClick={play}><RotateCcw className="h-4 w-4" aria-hidden />{t('landing.preview.replay')}</Button>
      )}
    </div>
  );
}

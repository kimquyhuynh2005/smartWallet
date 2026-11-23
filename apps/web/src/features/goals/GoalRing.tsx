import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Progress ring (SVG). The percentage is also printed in the middle, so the ring never carries the meaning alone.
 * role=progressbar with a spoken value; the stroke animates unless the user asked for reduced motion.
 */
export function GoalRing({ percent, name, size = 88, canceled, className }: { percent: number; name: string; size?: number; canceled?: boolean; className?: string }) {
  const { t } = useTranslation('goals');
  const lang = useLang();
  const stroke = size >= 120 ? 10 : 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, percent));
  const done = percent >= 100;
  const whole = Math.floor(percent);
  const label = whole > 999 ? `${formatPercent(999, lang)}+` : formatPercent(whole, lang);
  return (
    <div
      role="progressbar" aria-label={t('card.ringLabel', { name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown)}
      aria-valuetext={t('card.percent', { percent: Math.floor(percent) })}
      className={cn('relative shrink-0', className)} style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)}
          className={cn('transition-[stroke-dashoffset] duration-[400ms] ease-out motion-reduce:transition-none', canceled ? 'text-ink-3' : 'text-accent')}
        />
      </svg>
      <span className={cn('num absolute inset-0 flex items-center justify-center font-semibold text-ink', size >= 120 ? (label.length >= 4 ? 'text-xl' : 'text-2xl') : (label.length >= 4 ? 'text-xs' : 'text-base'), done && !canceled && 'text-accent')}>
        {label}
      </span>
    </div>
  );
}

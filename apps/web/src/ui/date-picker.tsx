import { CalendarDays } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, vnDayKey } from '@/lib/format';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import { controlClass } from './input';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** yyyy-MM-dd (a Vietnam calendar day) */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** show Today / Yesterday shortcuts: most entries are for one of those two days */
  shortcuts?: boolean;
}

/** Native date input (real OS calendar on phones, keyboard accessible) with Today/Yesterday chips and a locale-formatted reading. */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({ value, onChange, invalid, shortcuts = true, max, className, ...p }, ref) => {
  const { t } = useTranslation();
  const lang = useLang();
  const today = vnDayKey(new Date());
  const yesterday = vnDayKey(new Date(Date.now() - 86_400_000));
  const chip = (day: string, label: string) => (
    <button
      type="button" onClick={() => onChange(day)} aria-pressed={value === day}
      className={cn('min-h-11 rounded-full border px-4 text-sm transition-colors', value === day ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-ink-2 hover:bg-sunken')}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          ref={ref} type="date" lang={lang === 'vi' ? 'vi-VN' : 'en-GB'} value={value} max={max ?? today} onChange={(e) => e.target.value && onChange(e.target.value)} aria-invalid={invalid || undefined}
          className={cn(controlClass, 'num pl-10', invalid ? 'border-danger' : 'border-control hover:border-ink-2', className)}
          {...p}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {shortcuts && <>{chip(today, t('common.today'))}{chip(yesterday, t('common.yesterday'))}</>}
        {value && <span className="text-sm text-ink-2">{formatDate(`${value}T05:00:00Z`, lang, 'long')}</span>}
      </div>
    </div>
  );
});
DatePicker.displayName = 'DatePicker';

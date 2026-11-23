import { Delete } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const MAX = 999_999_999_999;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'] as const;

/** the new integer after pressing a key (digits append, "000" multiplies by 1000, null = empty) */
export function pressKey(value: number | null, key: (typeof KEYS)[number] | 'back'): number | null {
  const v = value ?? 0;
  const next = key === 'back' ? Math.floor(v / 10) : key === '000' ? v * 1000 : v * 10 + Number(key);
  return next === 0 ? null : Math.min(next, MAX);
}

const keyClass = 'num flex h-14 items-center justify-center rounded-md border border-line bg-surface text-xl font-semibold text-ink transition-colors hover:bg-sunken active:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

/** On-screen numeric keypad for phones: 56 px keys, 3 columns, 000 and backspace. The amount stays an integer, never a float. */
export function Keypad({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { t } = useTranslation('quick-add');
  return (
    <div role="group" aria-label={t('keypad')} className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button key={k} type="button" className={keyClass} onClick={() => onChange(pressKey(value, k))} aria-label={t('key', { key: k })}>{k}</button>
      ))}
      <button type="button" className={cn(keyClass, 'text-ink-2')} onClick={() => onChange(pressKey(value, 'back'))} aria-label={t('backspace')}>
        <Delete className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}

import { forwardRef, useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { formatMoneyInput, parseMoneyInput } from '@/lib/format';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import { controlClass } from './input';

export interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** integer dong (or null when empty). Never a float. */
  value: number | null;
  onChange: (value: number | null) => void;
  invalid?: boolean;
  /** largest allowed amount (default 999.999.999.999) */
  max?: number;
}

/**
 * VND field: groups digits as you type (1.500.000 / 1,500,000), no decimals, numeric keypad on phones,
 * and the caret stays next to the digit you were editing even when separators appear or disappear.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(({ value, onChange, invalid, max = 999_999_999_999, className, ...p }, ref) => {
  const lang = useLang();
  const inner = useRef<HTMLInputElement | null>(null);
  const caretDigits = useRef<number | null>(null); // digits to the left of the caret after the last edit
  const text = formatMoneyInput(value, lang);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || caretDigits.current === null || document.activeElement !== el) return;
    let seen = 0, pos = 0;
    while (pos < text.length && seen < caretDigits.current) { if (/\d/.test(text[pos])) seen++; pos++; }
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  });

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    caretDigits.current = raw.slice(0, caret).replace(/\D/g, '').length;
    const n = parseMoneyInput(raw);
    onChange(n === null ? null : Math.min(n, max));
  };

  return (
    <div className="relative">
      <input
        ref={(el) => { inner.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; }}
        type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" placeholder="0"
        value={text} onChange={handle} aria-invalid={invalid || undefined}
        className={cn(controlClass, 'num pr-14 text-right text-lg font-medium', invalid ? 'border-danger' : 'border-control hover:border-ink-2', className)}
        {...p}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-2" aria-hidden>{lang === 'vi' ? '₫' : 'VND'}</span>
    </div>
  );
});
MoneyInput.displayName = 'MoneyInput';

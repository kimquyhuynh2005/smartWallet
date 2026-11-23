import { useTranslation } from 'react-i18next';
import { moneyParts } from '@/lib/format';
import { useLang } from '@/hooks/useLang';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

type Kind = 'income' | 'expense' | 'transfer' | 'balance';
const SIZE = { sm: 'text-sm', md: 'text-base', lg: 'text-xl', xl: 'text-2xl', hero: 'text-3xl' } as const;

interface Props {
  /** integer dong; for income/expense pass the positive amount stored by the API */
  amount: number;
  /** income -> "+" in accent; expense -> "−" in ink (spending is normal, never red); transfer -> neutral; balance -> sign only when negative */
  kind?: Kind;
  size?: keyof typeof SIZE;
  className?: string;
  /** hide the unit (₫ / VND), e.g. in a narrow column whose header already says it */
  hideUnit?: boolean;
}

/**
 * Money, the way a ledger prints it: tabular digits, a real minus sign, locale format
 * (vi `1.500.000 ₫`, en `1,500,000 VND`). The sign is part of the text, so meaning never depends on color.
 */
export function AmountText({ amount, kind = 'balance', size = 'md', className, hideUnit }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const { value, animating } = useCountUp(amount);
  const signed = kind === 'expense' ? -Math.abs(amount) : kind === 'income' ? Math.abs(amount) : amount;
  const sign = (n: number) => (kind === 'expense' ? -Math.abs(n) : kind === 'income' ? Math.abs(n) : n);
  const p = moneyParts(sign(Math.round(value)), lang, kind === 'income' ? 'always' : 'auto');
  const final = animating ? moneyParts(signed, lang, kind === 'income' ? 'always' : 'auto') : null;
  const tone = kind === 'income' ? 'text-accent' : kind === 'transfer' ? 'text-ink-2' : 'text-ink';
  const spoken = kind === 'income' ? t('transactions.income') : kind === 'expense' ? t('transactions.expense') : kind === 'transfer' ? t('transactions.transfer') : '';
  return (
    <span className={cn('num whitespace-nowrap font-semibold', SIZE[size], tone, className)}>
      {spoken && <span className="sr-only">{spoken} </span>}
      {final && <span className="sr-only">{final.sign}{final.number} {final.unit}</span>}
      <span aria-hidden={animating || undefined}>
        {p.sign}{p.number}
        {!hideUnit && <span className="ml-1 text-[0.72em] font-medium text-ink-2">{p.unit}</span>}
      </span>
    </span>
  );
}

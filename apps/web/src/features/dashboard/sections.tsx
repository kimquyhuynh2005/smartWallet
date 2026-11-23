import { ArrowRight, CreditCard, Landmark, Minus, Smartphone, TrendingDown, TrendingUp, Wallet as WalletIcon, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Dashboard } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatMoney } from '@/lib/format';
import { Skeleton } from '@/ui';

export const linkCls = 'inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-accent underline-offset-4 hover:underline';

export function SectionHead({ title, to, seeAll }: { title: string; to?: string; seeAll?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="min-w-0 text-lg font-semibold text-ink">{title}</h2>
      {to && seeAll ? <Link to={to} className={linkCls}>{seeAll}<ArrowRight className="h-4 w-4" aria-hidden /></Link> : null}
    </div>
  );
}

export function DashboardSkeleton() {
  const { t } = useTranslation('dashboard');
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-busy role="status"><span className="sr-only">{t('loading')}</span>
      <div className="flex min-w-0 flex-col gap-6"><Skeleton className="h-64" /><Skeleton className="h-56" /><Skeleton className="h-72" /></div>
      <div className="flex min-w-0 flex-col gap-6"><Skeleton className="h-40" /><Skeleton className="h-44" /><Skeleton className="h-52" /></div>
    </div>
  );
}

/** change against the previous period: arrow icon + words, neutral ink (more or less is not good or bad by itself) */
export function Delta({ now, before }: { now: number; before: number | undefined }) {
  const { t } = useTranslation('dashboard');
  const lang = useLang();
  if (before === undefined) return null;
  const diff = now - before;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const text = diff === 0 ? t('delta.same') : t(diff > 0 ? 'delta.up' : 'delta.down', { amount: formatMoney(Math.abs(diff), lang, 'never') });
  return <p className="mt-1 flex items-start gap-1 text-sm text-ink-2"><Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{text}</span></p>;
}

export const WALLET_ICON: Record<string, LucideIcon> = { CASH: WalletIcon, BANK: Landmark, EWALLET: Smartphone, CREDIT: CreditCard };

/** stands in for the lazy chart: same height as the chart plus its legend line, so nothing shifts when it loads */
export function TrendFallback() {
  return <div aria-hidden><Skeleton className="h-56 w-full" /><div className="mt-2 h-5" /></div>;
}

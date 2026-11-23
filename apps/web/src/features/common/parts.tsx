import { ArrowLeftRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';
import { categoryName } from '@/hooks/useCategories';
import { formatDate, formatMoney, relativeDay } from '@/lib/format';
import type { Budget, Category, Goal, Transaction } from '@/lib/api/endpoints';
import { AmountText, CategoryIcon, ProgressBar } from '@/ui';
import { budgetState } from '@/ui/progress-bar';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-ink">{children}</h2>{action}</div>;
}

/** one ledger line: icon, what it was, when/where, and the signed amount on the right */
export function TransactionRow({ txn, category, walletName, toWalletName, showDate }: { txn: Transaction; category?: Category; walletName?: string; toWalletName?: string; showDate?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const transfer = txn.type === 'TRANSFER';
  const title = txn.note || (transfer ? t('transactions.transfer') : categoryName(category, lang, t('transactions.uncategorized')));
  const catLabel = transfer ? `${walletName ?? ''} → ${toWalletName ?? ''}` : categoryName(category, lang, t('transactions.uncategorized'));
  const when = showDate ? formatDate(txn.occurredAt, lang, 'day') : formatDate(txn.occurredAt, lang, 'time');
  return (
    <li className="flex items-center gap-3 py-3">
      <CategoryIcon category={category} transfer={transfer} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-base font-medium text-ink" lang={lang}>{title}</p>
        <p className="text-sm text-ink-2"><span className="inline-block max-w-full truncate align-bottom">{[catLabel, !transfer ? walletName : null].filter(Boolean).join(' · ')}</span><span className="block">{when}</span></p>
      </div>
      <AmountText amount={txn.amount} kind={txn.type === 'INCOME' ? 'income' : txn.type === 'EXPENSE' ? 'expense' : 'transfer'} className="shrink-0" />
    </li>
  );
}

export const dayHeading = (iso: string, lang: 'vi' | 'en', t: (k: string) => string) => {
  const r = relativeDay(iso);
  return r === 'today' ? t('common.today') : r === 'yesterday' ? t('common.yesterday') : formatDate(iso, lang, 'long');
};

/** budget line: category, "x of y", status bar with icon + word */
export function BudgetRow({ budget, category, className }: { budget: Budget; category?: Category; className?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const name = budget.categoryId ? categoryName(category, lang) : t('budgets.total');
  const over = budget.percentUsed >= 100;
  return (
    <li className={cn('flex flex-col gap-2 py-3', className)}>
      <div className="flex items-center gap-3">
        {budget.categoryId ? <CategoryIcon category={category} /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sunken text-sm font-semibold text-ink-2" aria-hidden>Σ</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-ink">{name}</p>
          <p className="num text-sm text-ink-2">{t('budgets.usedOf', { spent: formatMoney(budget.spent, lang), limit: formatMoney(budget.limitAmount, lang) })}</p>
        </div>
        <p className={cn('num shrink-0 text-right text-sm font-medium', over ? 'text-danger' : 'text-ink-2')}>
          {over ? t('budgets.overBy', { amount: formatMoney(Math.abs(budget.remaining), lang) }) : t('budgets.left', { amount: formatMoney(budget.remaining, lang) })}
        </p>
      </div>
      <ProgressBar percent={budget.percentUsed} label={name} />
    </li>
  );
}
export { budgetState };

export function GoalProgress({ goal }: { goal: Goal }) {
  const { t } = useTranslation();
  const lang = useLang();
  const done = goal.status === 'ACHIEVED';
  return (
    <div className="flex flex-col gap-1.5">
      <div role="progressbar" aria-label={goal.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(goal.percent))} className="h-2 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line">
        <div className="h-full rounded-full bg-accent transition-[width] duration-[400ms] ease-out motion-reduce:transition-none" style={{ width: `${Math.min(100, goal.percent)}%` }} />
      </div>
      <p className="num flex flex-wrap justify-between gap-x-3 text-sm text-ink-2">
        <span>{t('goals.savedOf', { saved: formatMoney(goal.savedAmount, lang), target: formatMoney(goal.targetAmount, lang) })}</span>
        <span className={cn('font-medium', done && 'text-accent')}>{done ? t('goals.achieved') : `${Math.floor(goal.percent)}%`}</span>
      </p>
    </div>
  );
}

export const TransferGlyph = ArrowLeftRight;

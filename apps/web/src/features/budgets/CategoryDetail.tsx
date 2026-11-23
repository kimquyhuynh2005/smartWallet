import { useQueries } from '@tanstack/react-query';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { endpoints, qk, useBudgets, type Transaction } from '@/api';
import { PageHeader, TransactionRow } from '@/features/common/parts';
import { categoryName, useCategories, useWallets } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { Alert, Button, Card, CategoryIcon, EmptyState, Skeleton } from '@/ui';
import { CategoryCard } from './BudgetCards';
import { AddBudgetDialog, DeleteBudgetDialog } from './dialogs';
import { usePeriodRange } from './helpers';
import { ErrorBlock } from './Overview';
import type { Budget } from '@/api';

const PAGE = 20;

/** /budgets/category/:categoryId: the budget of one category and its spending in the selected period (sub-categories included) */
export default function CategoryDetail() {
  const { t } = useTranslation('budgets');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const { categoryId = '' } = useParams();
  const range = usePeriodRange();
  const cats = useCategories();
  const wallets = useWallets();
  const budgets = useBudgets(range.apiPeriod);
  const [shown, setShown] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<{ budget: Budget; name: string } | null>(null);

  const category = cats.map.get(categoryId);
  const children = useMemo(() => (cats.data ?? []).filter((c) => c.parentId === categoryId), [cats.data, categoryId]);
  const family = useMemo(() => [categoryId, ...children.map((c) => c.id)], [categoryId, children]);
  const budget = budgets.data?.find((b) => b.categoryId === categoryId);

  const results = useQueries({
    queries: family.map((id) => {
      const f = { categoryId: id, type: 'EXPENSE' as const, from: range.fromIso, to: range.toIso, limit: 100, sort: 'occurredAt:desc' };
      return { queryKey: qk.transactions.list(f), queryFn: () => endpoints.transactions.list(f), enabled: !!categoryId && cats.isSuccess };
    }),
  });
  const txnLoading = results.some((r) => r.isLoading);
  const txnError = results.some((r) => r.isError);
  const txns: Transaction[] = useMemo(
    () => results.flatMap((r) => r.data?.data ?? []).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [results.map((r) => r.dataUpdatedAt).join('|')], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const back = <Link to="/budgets" className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />{t('actions.back')}</Link>;
  const name = categoryName(category, lang, t('detail.unknown'));

  if (cats.isSuccess && !category) {
    return <>{back}<EmptyState title={t('detail.notFound')}><Link className="font-medium text-accent underline" to="/budgets">{t('detail.backToBudgets')}</Link></EmptyState></>;
  }

  return (
    <>
      {back}
      <PageHeader
        title={name}
        subtitle={<span className="num">{t('periodRange', { range: range.range })}{children.length ? ` · ${t('detail.covers', { names: children.map((c) => categoryName(c, lang)).join(', ') })}` : ''}</span>}
        actions={category && <CategoryIcon category={category} />}
      />
      <div className="flex flex-col gap-6">
        {budgets.isLoading || cats.isLoading ? <Skeleton className="h-60" />
          : budgets.isError ? <ErrorBlock title={t('error.title')} hint={t('error.hint')} onRetry={() => void budgets.refetch()} />
          : budget ? <div className="max-w-xl"><CategoryCard budget={budget} category={category} apiPeriod={range.apiPeriod} onDelete={(b, n) => setDeleting({ budget: b, name: n })} showName={false} /></div>
          : <EmptyState title={t('detail.noBudget')} action={<Button variant="secondary" onClick={() => setAdding(true)}>{t('detail.setBudget')}</Button>} />}

        <section aria-labelledby="cat-txns">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="cat-txns" className="text-lg font-semibold text-ink">{t('detail.txns')}</h2>
            <Link to={`/transactions?categoryId=${categoryId}`} className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-accent underline-offset-2 hover:underline">{t('actions.seeAll')}</Link>
          </div>
          {txnLoading ? <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
            : txnError ? <Alert tone="danger">{t('detail.errorTxn')} <button type="button" className="font-semibold underline" onClick={() => results.forEach((r) => void r.refetch())}>{tc('common.retry')}</button></Alert>
            : !txns.length ? <EmptyState icon={ReceiptText} title={t('detail.empty')}>{t('detail.emptyHint')}</EmptyState>
            : (
              <Card className="py-1 md:py-2">
                <ul className="divide-y divide-line">
                  {txns.slice(0, shown).map((x) => <TransactionRow key={x.id} txn={x} category={cats.map.get(x.categoryId ?? '')} walletName={wallets.map.get(x.walletId)?.name} showDate />)}
                </ul>
                {txns.length > shown && <div className="border-t border-line pt-2"><Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>{t('detail.more')}</Button></div>}
              </Card>
            )}
        </section>
      </div>
      <AddBudgetDialog open={adding} onClose={() => setAdding(false)} apiPeriod={range.apiPeriod} budgets={budgets.data ?? []} presetCategoryId={categoryId} />
      <DeleteBudgetDialog target={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

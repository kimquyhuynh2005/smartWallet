import { ArrowLeftRight, Import, Plus, Receipt, Repeat, Search, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCategoryList, useInfiniteTransactions, useWallets } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { categoryName } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { formatDate, formatMoney } from '@/lib/format';
import { useUi } from '@/stores/ui';
import { Badge, Button, buttonVariants, Card, EmptyState, Input, Skeleton } from '@/ui';
import { FilterPanel } from './FilterPanel';
import { TransactionGroups } from './Ledger';
import { useTxFilters } from './filters';

export default function TransactionsList() {
  const { t } = useTranslation('transactions');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const { explicit, effective, bounds, api, set, clear } = useTxFilters();
  const wallets = useWallets(true);
  const cats = useCategoryList();
  const [panel, setPanel] = useState(false);

  // search: typing is local, the URL (and the request) follows 300 ms after the last key
  const [text, setText] = useState(explicit.q);
  useEffect(() => { setText(explicit.q); }, [explicit.q]);
  useEffect(() => {
    const id = setTimeout(() => { if (text.trim() !== explicit.q) set({ q: text.trim() }); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const list = useInfiniteTransactions(api);
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.meta.total ?? 0;

  // infinite scroll: a sentinel under the list loads the next page when it nears the viewport; the button below is the fallback
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage(); }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  // active filters as removable chips (the search box shows q itself; the date range only counts when it differs from the top-bar month)
  const dateChanged = explicit.from !== undefined || explicit.to !== undefined;
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (explicit.type) chips.push({ key: 'type', label: t(explicit.type.toLowerCase()), remove: () => set({ type: undefined }) });
  if (explicit.walletId) chips.push({ key: 'wallet', label: wallets.data?.find((w) => w.id === explicit.walletId)?.name ?? t('form.wallet'), remove: () => set({ walletId: undefined }) });
  if (explicit.categoryId) chips.push({ key: 'cat', label: categoryName(cats.data?.find((c) => c.id === explicit.categoryId), lang, t('form.category')), remove: () => set({ categoryId: undefined }) });
  if (dateChanged) chips.push({ key: 'date', label: `${formatDate(`${effective.from}T05:00:00Z`, lang, 'short')} – ${formatDate(`${effective.to}T05:00:00Z`, lang, 'short')}`, remove: () => set({ from: undefined, to: undefined }) });
  if (explicit.minAmount !== undefined) chips.push({ key: 'min', label: t('filters.chipMin', { amount: formatMoney(explicit.minAmount, lang) }), remove: () => set({ minAmount: undefined }) });
  if (explicit.maxAmount !== undefined) chips.push({ key: 'max', label: t('filters.chipMax', { amount: formatMoney(explicit.maxAmount, lang) }), remove: () => set({ maxAmount: undefined }) });
  const filtered = chips.length > 0 || !!explicit.q;

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => openQuickAdd({ mode: 'TRANSFER' })}><ArrowLeftRight className="h-4 w-4" aria-hidden />{t('transferAction')}</Button>
      <Button className="hidden md:inline-flex" onClick={() => openQuickAdd()}><Plus className="h-4 w-4" aria-hidden />{tc('nav.add')}</Button>
    </div>
  );

  return (
    <>
      <PageHeader title={t('title')} subtitle={list.isSuccess ? t('count', { count: total }) : undefined} actions={headerActions} />

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:max-w-sm sm:flex-1">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('searchPlaceholder')} leading={<Search className="h-5 w-5" aria-hidden />} aria-label={tc('common.search')} type="search" lang={lang} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setPanel(true)} aria-haspopup="dialog">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />{t('filters.button')}
            {chips.length > 0 && <Badge tone="accent" aria-label={t('filters.activeCount', { count: chips.length })}>{chips.length}</Badge>}
          </Button>
          <Link to="/transactions/recurring" className={buttonVariants({ variant: 'ghost' })}><Repeat className="h-4 w-4" aria-hidden />{t('recurring.link')}</Link>
          <Link to="/transactions/import" className={buttonVariants({ variant: 'ghost' })}><Import className="h-4 w-4" aria-hidden />{t('import.link')}</Link>
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="mb-4 flex flex-wrap items-center gap-2" aria-label={t('filters.active')}>
          {chips.map((c) => (
            <li key={c.key}>
              <button type="button" onClick={c.remove} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface py-1 pl-3 pr-2 text-sm text-ink hover:bg-sunken" aria-label={t('filters.remove', { name: c.label })}>
                {c.label}<X className="h-4 w-4 text-ink-3" aria-hidden />
              </button>
            </li>
          ))}
          <li><Button variant="ghost" size="sm" onClick={() => { clear(); setText(''); }}>{t('filters.clear')}</Button></li>
        </ul>
      )}

      {list.isLoading ? (
        <Card aria-busy="true"><div className="flex flex-col gap-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div></Card>
      ) : list.isError ? (
        <EmptyState icon={TriangleAlert} title={t('loadError')} action={<Button variant="secondary" onClick={() => void list.refetch()}>{tc('common.retry')}</Button>}>{t('loadErrorHint')}</EmptyState>
      ) : !rows.length ? (
        filtered
          ? <EmptyState icon={Search} title={t('noResults')} action={<Button variant="secondary" onClick={() => { clear(); setText(''); }}>{t('filters.clear')}</Button>}>{t('noResultsHint')}</EmptyState>
          : <EmptyState icon={Receipt} title={t('empty')} action={<Button onClick={() => openQuickAdd()}><Plus className="h-4 w-4" aria-hidden />{tc('nav.add')}</Button>}>{t('emptyHint')}</EmptyState>
      ) : (
        <>
          <TransactionGroups rows={rows} />
          <div ref={sentinel} aria-hidden className="h-px" />
          {list.hasNextPage && (
            <div className="mt-4 flex">
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t('loadMore')}</Button>
            </div>
          )}
          {!list.hasNextPage && rows.length > 20 && <p className="mt-4 text-sm text-ink-3">{t('endOfList')}</p>}
        </>
      )}

      {panel && <FilterPanel open onOpenChange={setPanel} value={effective} bounds={bounds} onApply={set} />}
    </>
  );
}

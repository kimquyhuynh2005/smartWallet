import { AlertCircle, ArrowRight, CalendarClock, History, Plus, Sprout, Target } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isPlanLimit, useDashboard, usePeriod, useProfile, useRecurringRules } from '@/api';
import { BudgetRow, GoalProgress, PageHeader, TransactionRow } from '@/features/common/parts';
import { categoryName, useCategories, useWallets } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { categoryVisual } from '@/lib/categories';
import { formatDate, formatMoney, formatPercent, formatPeriodLabel, TZ } from '@/lib/format';
import { useUi } from '@/stores/ui';
import { AmountText, Button, Card, CategoryIcon, EmptyState } from '@/ui';
import { StreakCard } from './StreakCard';
import { DashboardSkeleton, Delta, SectionHead, TrendFallback, WALLET_ICON, linkCls } from './sections';

const TrendChart = lazy(() => import('./TrendChart')); // keeps recharts off the critical path

const vnHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24;
const dayPart = (h: number) => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 18 ? 'afternoon' : 'evening');

/** whole percent for display (floor, like the alerts and the budget bars) */
const wholePct = (n: number, lang: 'vi' | 'en') => formatPercent(Math.floor(n), lang);

export default function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const { apiPeriod, isCurrent } = usePeriod();
  const q = useDashboard(apiPeriod);
  const me = useProfile();
  const rules = useRecurringRules();
  const cats = useCategories();
  const wallets = useWallets();

  const words = (me.data?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const first = words[words.length - 1];
  const greeting = first ? t(`greeting.${dayPart(vnHour())}`, { name: first }) : t('greeting.plain');
  const addButton = <Button className="hidden md:inline-flex" onClick={() => openQuickAdd()}><Plus className="h-4 w-4" aria-hidden />{tc('nav.add')}</Button>;

  const upcoming = useMemo(() => [...(rules.data ?? [])].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)).slice(0, 3), [rules.data]);

  if (q.isError && isPlanLimit(q.error)) {
    return (
      <>
        <PageHeader title={greeting} />
        <EmptyState icon={History} title={t('planLimit.title')}>{t('planLimit.hint')}</EmptyState>
      </>
    );
  }
  if (q.isError) {
    return (
      <>
        <PageHeader title={greeting} />
        <Card role="alert" className="flex flex-col items-start gap-3">
          <AlertCircle className="h-6 w-6 text-danger" aria-hidden />
          <div className="flex max-w-prose flex-col gap-1"><p className="text-base font-semibold text-ink">{t('error.title')}</p><p className="text-sm text-ink-2">{t('error.hint')}</p></div>
          <Button variant="secondary" loading={q.isFetching} onClick={() => void q.refetch()}>{tc('common.retry')}</Button>
        </Card>
      </>
    );
  }
  if (!q.data) return <><PageHeader title={greeting} /><DashboardSkeleton /></>;

  const d = q.data;
  const total = d.budgets.find((b) => b.categoryId === null);
  const catBudgets = d.budgets.filter((b) => b.categoryId !== null).sort((a, b) => b.percentUsed - a.percentUsed).slice(0, 4);
  const idx = d.trend.findIndex((p) => p.period === d.period.label);
  const prev = idx > 0 ? d.trend[idx - 1] : undefined;
  const brandNew = d.recentTransactions.length === 0 && d.trend.every((p) => p.income === 0 && p.expense === 0);
  const walletName = (id: string) => wallets.map.get(id)?.name ?? d.wallets.items.find((w) => w.id === id)?.name;
  const maxCat = Math.max(1, ...d.topCategories.map((c) => c.total));
  const subtitle = isCurrent ? t('daysLeft', { count: d.period.daysLeft }) : `${formatPeriodLabel(d.period.label, lang)} · ${t('pastPeriod')}`;

  const summary = !total ? null
    : total.percentUsed >= 100 ? t('summary.over', { amount: formatMoney(Math.abs(total.remaining), lang) })
    : isCurrent ? t('summary.used', { percent: wholePct(total.percentUsed, lang), count: total.daysLeft })
    : t('summary.usedPast', { percent: wholePct(total.percentUsed, lang) });

  return (
    <>
      <PageHeader title={greeting} subtitle={subtitle} actions={addButton} />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6 max-lg:contents">
          {brandNew ? (
            <EmptyState className="max-lg:[order:-2]" icon={Sprout} title={t('empty.title')} action={<Button onClick={() => openQuickAdd()}><Plus className="h-4 w-4" aria-hidden />{t('empty.cta')}</Button>}>{t('empty.hint')}</EmptyState>
          ) : (
            <Card className="flex flex-col gap-5 max-lg:[order:-2]">
              {total ? (
                <div>
                  <p className="eyebrow">{isCurrent ? t('hero.left') : t('hero.leftPast')}</p>
                  <div className="mt-1"><AmountText amount={total.remaining} size="hero" /></div>
                  {summary && <p className="mt-1 max-w-prose text-base text-ink-2">{summary}</p>}
                  {isCurrent && (
                    <div className="mt-4 rounded-md bg-accent-soft px-4 py-3">
                      <p className="text-sm text-ink-2">{t('hero.safeToday')}</p>
                      <AmountText amount={total.safeToSpendToday} size="xl" />
                      {total.safeToSpendToday === 0 && <p className="mt-1 text-sm text-ink-2">{t('hero.safeZero')}</p>}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState icon={Sprout} title={t('noBudget.title')} className="border-0 p-0" action={<Link to="/budgets" className={linkCls}>{t('noBudget.cta')}<ArrowRight className="h-4 w-4" aria-hidden /></Link>}>{t('noBudget.hint')}</EmptyState>
              )}
              <dl className="grid grid-cols-1 gap-4 border-t border-line pt-4 divide-y divide-line sm:grid-cols-3 sm:divide-y-0 [&>div:not(:first-child)]:pt-4 sm:[&>div]:pt-0">
                {([['income', d.totals.income, 'income', prev?.income], ['expense', d.totals.expense, 'expense', prev?.expense], ['net', d.totals.net, 'balance', prev?.net]] as const).map(([k, v, kind, before]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-sm text-ink-2">{t(k)}</dt>
                    <dd className="mt-0.5"><AmountText amount={v} kind={kind} size="lg" /><Delta now={v} before={before} /></dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {catBudgets.length > 0 && (
            <Card>
              <SectionHead title={t('budgets')} to="/budgets" seeAll={tc('common.seeAll')} />
              <ul className="divide-y divide-line">{catBudgets.map((b) => <BudgetRow key={b.id} budget={b} category={b.categoryId ? cats.map.get(b.categoryId) : undefined} />)}</ul>
            </Card>
          )}

          {!brandNew && (
            <Card>
              <SectionHead title={t('trendTitle')} />
              <Suspense fallback={<TrendFallback />}><TrendChart points={d.trend} /></Suspense>
            </Card>
          )}

          <Card>
            <SectionHead title={t('recent')} to="/transactions" seeAll={tc('common.seeAll')} />
            {d.recentTransactions.length ? (
              <ul className="divide-y divide-line">
                {d.recentTransactions.map((x) => <TransactionRow key={x.id} txn={x} category={x.categoryId ? cats.map.get(x.categoryId) : undefined} walletName={walletName(x.walletId)} toWalletName={x.transferWalletId ? walletName(x.transferWalletId) : undefined} showDate />)}
              </ul>
            ) : <p className="text-sm text-ink-2">{t('noTransactions')}</p>}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6 max-lg:contents">
          <Card className="max-lg:[order:-1]">
            <SectionHead title={t('wallets')} to="/wallets" seeAll={tc('common.seeAll')} />
            <p className="text-sm text-ink-2">{t('totalBalance')}</p>
            <AmountText amount={d.wallets.total} size="xl" />
            {d.wallets.items.length ? (
              <ul className="-mx-4 mt-4 flex snap-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:-mx-5 md:px-5 lg:mx-0 lg:grid lg:grid-cols-1 lg:overflow-visible lg:px-0 lg:pb-0 after:w-1 after:shrink-0 lg:after:hidden">
                {d.wallets.items.map((w) => {
                  const Icon = WALLET_ICON[w.type] ?? WALLET_ICON.CASH;
                  return (
                    <li key={w.id} className="w-44 shrink-0 snap-start scroll-ml-4 lg:w-auto">
                      <Link to={`/wallets/${w.id}`} title={`${w.name}: ${formatMoney(w.balance, lang)}`} className="flex min-h-11 flex-col gap-1 rounded-md border border-line bg-paper px-3 py-3 hover:border-line-strong lg:flex-row lg:items-center lg:justify-between lg:gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-base text-ink"><Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /><span className="truncate">{w.name}</span></span>
                        <AmountText amount={w.balance} size="md" className="block truncate" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-3 text-sm text-ink-2">{t('noWallets')} <Link to="/wallets" className="font-medium text-accent hover:underline">{t('addWallet')}</Link></p>}
          </Card>

          <Card>
            <SectionHead title={t('goals')} to="/goals" seeAll={tc('common.seeAll')} />
            {d.goals.length ? (
              <ul className="flex flex-col gap-5">
                {d.goals.slice(0, 3).map((g) => (
                  <li key={g.id} className="flex flex-col gap-2">
                    <Link to={`/goals/${g.id}`} className="flex min-h-9 items-center gap-2 text-base font-medium text-ink hover:underline"><Target className="h-4 w-4 shrink-0 text-ink-3" aria-hidden /><span className="truncate">{g.name}</span></Link>
                    <GoalProgress goal={g} />
                    {g.requiredMonthlySaving ? <p className="num text-sm text-ink-2">{t('requiredMonthly', { amount: formatMoney(g.requiredMonthlySaving, lang) })}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-2">{t('noGoals')} <Link to="/goals" className="font-medium text-accent hover:underline">{t('addGoal')}</Link></p>}
          </Card>

          {isCurrent && <StreakCard />}

          {upcoming.length > 0 && (
            <Card>
              <SectionHead title={t('upcoming')} to="/transactions/recurring" seeAll={tc('common.seeAll')} />
              <ul className="divide-y divide-line">
                {upcoming.map((r) => {
                  const cat = r.categoryId ? cats.map.get(r.categoryId) : undefined;
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      <CategoryIcon category={cat} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-medium text-ink">{r.note || categoryName(cat, lang, tc('transactions.uncategorized'))}</p>
                        <p className="flex items-center gap-1 text-sm text-ink-2"><CalendarClock className="h-4 w-4 shrink-0" aria-hidden /><span className="num">{formatDate(r.nextRunAt, lang, 'long')}</span></p>
                      </div>
                      <AmountText amount={r.amount} kind={r.type === 'INCOME' ? 'income' : 'expense'} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {d.topCategories.length > 0 && (
            <Card>
              <SectionHead title={t('byCategory')} to="/reports" seeAll={tc('common.seeAll')} />
              <ul className="flex flex-col gap-3">
                {d.topCategories.map((c) => {
                  const cat = c.categoryId ? cats.map.get(c.categoryId) : undefined;
                  const { color } = categoryVisual(cat);
                  const name = c.categoryId ? categoryName(cat, lang, lang === 'en' ? c.nameEn : c.nameVi) : tc('transactions.uncategorized');
                  return (
                    <li key={c.categoryId ?? 'none'} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <CategoryIcon category={cat} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-base text-ink">{name}</span>
                        <span className="num text-sm text-ink-2">{wholePct(c.percent, lang)}</span>
                        <AmountText amount={c.total} size="sm" hideUnit className="w-24 text-right" />
                      </div>
                      <div className="h-1.5 rounded-full bg-sunken" aria-hidden><div className="h-full rounded-full" style={{ width: `${(c.total / maxCat) * 100}%`, backgroundColor: color }} /></div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

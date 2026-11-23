import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUp, Check, Footprints, Minus, Sprout, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { endpoints, qk, useDashboard } from '@/api';
import { useLang } from '@/hooks/useLang';
import { request } from '@/lib/api/client';
import { formatMoney, TZ, vnDayKey } from '@/lib/format';
import { Button, Card, EmptyState, Skeleton } from '@/ui';
import { SectionHead, linkCls } from './sections';
import { computeStreak, dailyLimitOf, shiftDayKey, STREAK_WINDOW_DAYS, type DayStatus } from './streak';

/** GET /reports/streak (docs/backend-requests.md BR-34): answers 404 on the real API today, then the client-side computation below stands in */
const StreakOut = z.object({ current: z.number().int().min(0), best: z.number().int().min(0), lastDay: z.string().nullable() });

const MAX_PAGES = 5; // 500 expenses is far beyond 60 days of ordinary use

const STATUS_ICON: Record<DayStatus, LucideIcon> = { within: Check, over: ArrowUp, none: Minus };
const STATUS_CLS: Record<DayStatus, string> = {
  within: 'border-accent/40 bg-accent-soft text-accent',
  over: 'border-line-strong bg-sunken text-ink-2',
  none: 'border-line-strong bg-paper text-ink-2',
};

function useServerStreak() {
  return useQuery({ queryKey: [...qk.reports.all, 'streak'], queryFn: () => request('/reports/streak', { schema: StreakOut }) as Promise<z.infer<typeof StreakOut>>, retry: false, staleTime: 60_000, meta: { silent: true } });
}

/** the last 60 Vietnam days of EXPENSE rows (all pages); `qk.transactions.all` prefix, so any money write refreshes it */
function useExpenseWindow(today: string, enabled: boolean) {
  const from = shiftDayKey(today, -(STREAK_WINDOW_DAYS - 1));
  return useQuery({
    queryKey: [...qk.transactions.all, 'streak-window', from],
    enabled, staleTime: 60_000, meta: { silent: true },
    queryFn: async () => {
      const rows: { occurredAt: string; amount: number }[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await endpoints.transactions.list({ type: 'EXPENSE', from, limit: 100, page, sort: 'occurredAt:desc' });
        rows.push(...r.data);
        if (r.meta.page * r.meta.limit >= r.meta.total) break;
      }
      return rows;
    },
  });
}

export function StreakCard() {
  const { t } = useTranslation('dashboard');
  const lang = useLang();
  const today = vnDayKey(new Date());
  const dash = useDashboard(); // the CURRENT period, whatever month the top bar shows: a streak is about today
  const total = dash.data?.budgets.find((b) => b.categoryId === null);
  const dailyLimit = total ? dailyLimitOf(total.limitAmount, total.periodStartsAt, total.periodEndsAt) : 0;
  const server = useServerStreak();
  const rows = useExpenseWindow(today, !!total);

  const local = useMemo(() => (rows.data ? computeStreak(rows.data, dailyLimit, new Date()) : null), [rows.data, dailyLimit]);
  const weekday = useMemo(() => new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { timeZone: TZ, weekday: 'short' }), [lang]);

  if (dash.isError) return null; // the page already explains a failed dashboard
  const head = <SectionHead title={t('streak.title')} />;

  if (dash.isPending || (total && rows.isPending && !server.data && !rows.isError)) {
    return <Card role="status" aria-busy>{head}<span className="sr-only">{t('streak.loading')}</span><Skeleton className="h-28 w-full" /></Card>;
  }
  if (!total) {
    return (
      <Card>
        {head}
        <EmptyState icon={Sprout} title={t('streak.empty.title')} className="border-0 p-0" action={<Link to="/budgets" className={linkCls}>{t('streak.empty.cta')}<ArrowRight className="h-4 w-4" aria-hidden /></Link>}>{t('streak.empty.hint')}</EmptyState>
      </Card>
    );
  }
  if (!local && !server.data) {
    return (
      <Card>
        {head}
        <p className="text-sm text-ink-2">{t('streak.error.text')}</p>
        <Button className="mt-2" variant="secondary" loading={rows.isFetching} onClick={() => void rows.refetch()}>{t('streak.error.retry')}</Button>
      </Card>
    );
  }

  const current = server.data?.current ?? local?.current ?? 0;
  const best = Math.max(server.data?.best ?? local?.best ?? 0, current);
  const noData = !local || local.days.every((d) => d.status === 'none');
  const week = local?.days.slice(-7) ?? [];

  return (
    <Card>
      {head}
      <div className="flex items-center gap-3">
        <Footprints className="h-6 w-6 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 text-base text-ink">
          {current > 0 ? <><span className="num text-2xl font-semibold text-ink">{current}</span>{' '}<span className="text-ink-2">{t('streak.inARow', { count: current })}</span></> : <span className="text-ink-2">{noData ? t('streak.first') : t('streak.restart')}</span>}
        </p>
      </div>
      <p className="mt-2 text-sm text-ink-2">{best > 0 ? <span className="num">{t('streak.best', { count: best })}</span> : t('streak.bestNone')}</p>

      <p className="mt-4 text-sm text-ink-2"><Trans t={t} i18nKey="streak.hint" values={{ amount: formatMoney(dailyLimit, lang) }} components={{ n: <span className="num" /> }} />
      </p>

      <ul className="mt-4 flex justify-between gap-1" aria-label={t('streak.week')}>
        {week.map((d) => {
          const Icon = STATUS_ICON[d.status];
          const label = weekday.format(new Date(`${d.day}T12:00:00+07:00`));
          return (
            <li key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${label}: ${t(`streak.day.${d.status}`)}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${STATUS_CLS[d.status]}`}><Icon className="h-4 w-4" aria-hidden /></span>
              <span className="text-xs text-ink-2" aria-hidden>{label}</span>
              <span className="sr-only">{`${label}: ${t(`streak.day.${d.status}`)}`}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {(['within', 'over', 'none'] as const).map((k) => { const I = STATUS_ICON[k]; return <span key={k} className="inline-flex items-center gap-1"><I className="h-3.5 w-3.5" aria-hidden />{t(`streak.day.${k}`)}</span>; })}
      </p>
    </Card>
  );
}

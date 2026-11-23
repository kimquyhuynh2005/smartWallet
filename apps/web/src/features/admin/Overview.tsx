import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminGrowth, useAdminStats, useAdminUsers } from '@/api';
import { formatPercent, vnDayKey } from '@/lib/format';
import { useLang } from '@/hooks/useLang';
import { Alert, Card, Skeleton } from '@/ui';
import { GrowthCard } from './Growth';
import { ErrorRetry } from './shared';

export default function Overview() {
  const { t } = useTranslation('admin');
  const lang = useLang();
  const stats = useAdminStats();
  const users = useAdminUsers();
  const growth = useAdminGrowth(12);

  const values = useMemo(() => {
    // FROM THE API (GET /admin/stats): users, premium.
    // DERIVED here: Premium share = premium / users; locked = rows with status LOCKED in the users list;
    // new this month = last growth point (mocked endpoint), else users created in the current Vietnam month (users list).
    const total = stats.data?.users;
    const premium = stats.data?.premium;
    const share = total ? ((premium ?? 0) / total) * 100 : total === 0 ? 0 : undefined;
    const locked = users.data?.filter((u) => u.status === 'LOCKED').length;
    const month = vnDayKey(new Date()).slice(0, 7);
    const last = growth.data?.points.at(-1);
    const fromList = users.data?.filter((u) => vnDayKey(u.createdAt).slice(0, 7) === month).length;
    const fresh = last && last.period === month ? last.newUsers : fromList;
    return { total, premium, share, locked, fresh };
  }, [stats.data, users.data, growth.data]);

  const cards: { key: string; v: string | undefined; derived?: boolean }[] = [
    { key: 'total', v: values.total?.toLocaleString(lang) },
    { key: 'premium', v: values.premium?.toLocaleString(lang) },
    { key: 'share', derived: true, v: values.share === undefined ? undefined : formatPercent(values.share, lang) },
    { key: 'fresh', derived: true, v: values.fresh?.toLocaleString(lang) },
    { key: 'locked', derived: true, v: values.locked?.toLocaleString(lang) },
  ];
  const failed = (stats.isError || users.isError) && !stats.isLoading && !users.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info">{t('privacy')}</Alert>
      {stats.isError && users.isError ? <ErrorRetry onRetry={() => { void stats.refetch(); void users.refetch(); }} busy={stats.isFetching} /> : (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((c) => (
            <Card key={c.key} className="min-w-0 p-4 md:p-4">
              <dt className="text-sm text-ink-2">{t(`stats.${c.key}`)}</dt>
              <dd className="num mt-1 text-2xl font-semibold text-ink">{c.v ?? (failed ? <><span aria-hidden>–</span><span className="sr-only">{t('stats.na')}</span></> : <Skeleton className="h-8 w-16" />)}{c.derived && <span className="mt-1 block text-xs font-normal text-ink-2">{t('stats.derived')}</span>}</dd>
            </Card>
          ))}
        </dl>
      )}
      <GrowthCard />
    </div>
  );
}

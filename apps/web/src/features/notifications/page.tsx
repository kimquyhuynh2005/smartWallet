import { useInfiniteQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NotificationItem } from './NotificationItem';
import { endpoints, qk, useMarkAllNotificationsRead, useMarkNotificationRead, useUnreadCount } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { Button, Card, EmptyState, Skeleton } from '@/ui';

const PAGE = 20;

/** /notifications: every notification, newest first, "Xem thêm" pages. Reacts to invalidation from the shell's socket hook (no socket here). */
export default function NotificationsPage() {
  const { t } = useTranslation('notifications');
  const q = useInfiniteQuery({
    queryKey: qk.notifications.list({ view: 'page', limit: PAGE }),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.notifications.list({ page: pageParam, limit: PAGE }),
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });
  const read = useMarkNotificationRead();
  const readAll = useMarkAllNotificationsRead();
  const unread = useUnreadCount().data ?? 0;
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={unread > 0 ? <Button variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>{t('markAll')}</Button> : undefined}
      />
      {q.isLoading ? (
        <Card className="flex flex-col gap-4 p-4" aria-busy>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</Card>
      ) : q.isError ? (
        <EmptyState icon={Bell} title={t('loadError')} action={<Button variant="secondary" onClick={() => void q.refetch()}>{t('retry')}</Button>} />
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title={t('empty')}>{t('emptyHint')}</EmptyState>
      ) : (
        <>
          <Card className="px-3 py-1 md:px-4">
            <ul className="divide-y divide-line">
              {items.map((n) => <li key={n.id}><NotificationItem n={n} onRead={(id) => read.mutate(id)} /></li>)}
            </ul>
          </Card>
          {q.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{t('loadMore')}</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

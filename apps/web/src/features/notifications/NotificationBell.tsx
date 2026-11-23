import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NotificationItem } from './NotificationItem';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from '@/api';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { Button, Skeleton } from '@/ui';

const BELL = 'relative flex h-11 w-11 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

/**
 * Top-bar bell (ALR-01/02). Unread count capped at 9+; on desktop it opens a popover with the latest notifications,
 * on mobile it goes to /notifications. Fresh data arrives through the shell's socket hook, which invalidates ['notifications'].
 */
export function NotificationBell() {
  const { t } = useTranslation('notifications');
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const unread = useUnreadCount();
  const n = unread.data ?? 0;
  const label = n > 0 ? t('bellUnread', { n }) : t('bell');
  const badge = n > 0 && (
    <span className="num absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-accent-ink" aria-hidden>{n > 9 ? '9+' : n}</span>
  );

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  useEffect(() => { if (!desktop) setOpen(false); }, [desktop]);

  if (!desktop) {
    return <Link to="/notifications" className={BELL} aria-label={label}><Bell className="h-5 w-5" aria-hidden />{badge}</Link>;
  }
  return (
    <div ref={root} className="relative">
      <button ref={btn} type="button" className={BELL} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((o) => !o)}>
        <Bell className="h-5 w-5" aria-hidden />{badge}
      </button>
      {open && <Panel id={panelId} unread={n} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Panel({ id, unread, onClose }: { id: string; unread: number; onClose: () => void }) {
  const { t } = useTranslation('notifications');
  const list = useNotifications({ limit: 6 });
  const read = useMarkNotificationRead();
  const readAll = useMarkAllNotificationsRead();
  const items = list.data?.data ?? [];
  return (
    <div id={id} role="dialog" aria-label={t('title')} className="absolute right-0 top-full z-50 mt-2 w-[24rem] max-w-[calc(100vw-1.5rem)] animate-fade-in rounded-lg border border-line bg-surface shadow-float motion-reduce:animate-none">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-base font-semibold text-ink">{t('latest')}</h2>
        {unread > 0 && <Button size="sm" variant="ghost" loading={readAll.isPending} onClick={() => readAll.mutate()}>{t('markAll')}</Button>}
      </div>
      <div className="max-h-[min(26rem,60dvh)] overflow-y-auto">
        {list.isLoading ? (
          <div className="flex flex-col gap-3 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : list.isError ? (
          <div className="flex flex-col items-start gap-2 p-4 text-sm text-ink-2">
            <p>{t('loadError')}</p>
            <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>{t('retry')}</Button>
          </div>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-ink-2">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((x) => <li key={x.id}><NotificationItem n={x} compact onRead={(i) => read.mutate(i)} onNavigate={onClose} /></li>)}
          </ul>
        )}
      </div>
      <div className="border-t border-line p-1.5">
        <Link to="/notifications" onClick={onClose} className="flex min-h-11 items-center justify-center rounded-md text-sm font-medium text-accent hover:bg-sunken">{t('seeAll')}</Link>
      </div>
    </div>
  );
}

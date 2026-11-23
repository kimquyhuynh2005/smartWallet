import { Bell, OctagonAlert, Target, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AppNotification, Category } from '@/api';
import { categoryName, useCategories } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import type { Lang } from '@/lib/format';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const VISUAL: Record<AppNotification['type'], { Icon: LucideIcon; cls: string }> = {
  BUDGET_WARNING: { Icon: TriangleAlert, cls: 'bg-warn-soft text-warn' },
  BUDGET_EXCEEDED: { Icon: OctagonAlert, cls: 'bg-danger-soft text-danger' },
  GOAL: { Icon: Target, cls: 'bg-sunken text-ink-2' },
  SYSTEM: { Icon: Bell, cls: 'bg-sunken text-ink-2' },
};

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Budget alert title built in the UI language from payload.percentUsed + category; null (use the stored message) when the payload lacks the percent. */
function budgetTitle(n: AppNotification, t: TFunction<'notifications'>, lang: Lang, cats: Map<string, Category>): string | null {
  if (n.type !== 'BUDGET_WARNING' && n.type !== 'BUDGET_EXCEEDED') return null;
  const raw = n.payload.percentUsed;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const pct = Math.floor(raw);
  const catId = str(n.payload.categoryId);
  if (!catId) return t('alertTitleTotal', { pct });
  const cat = cats.get(catId);
  return cat ? t('alertTitle', { pct, name: categoryName(cat, lang) }) : null;
}

/** where a notification leads: a budget (category detail when it has one), a goal, or nowhere */
export function notificationLink(n: AppNotification): { to: string; labelKey: 'viewBudget' | 'viewGoal' } | null {
  if (n.type === 'BUDGET_WARNING' || n.type === 'BUDGET_EXCEEDED') {
    const cat = str(n.payload.categoryId);
    return { to: cat ? `/budgets/category/${cat}` : '/budgets', labelKey: 'viewBudget' };
  }
  if (n.type === 'GOAL') {
    const id = str(n.payload.goalId);
    return { to: id ? `/goals/${id}` : '/goals', labelKey: 'viewGoal' };
  }
  return null;
}

/** "5 phút trước" / "5 min ago"; older than a week falls back to the date */
export function useRelativeTime() {
  const { t } = useTranslation('notifications');
  const lang = useLang();
  return (iso: string, now = Date.now()): string => {
    const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
    if (mins < 1) return t('ago.now');
    if (mins < 60) return t('ago.minutes', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('ago.hours', { n: hours });
    const days = Math.floor(hours / 24);
    if (days === 1) return t('ago.yesterday');
    if (days < 7) return t('ago.days', { n: days });
    return formatDate(iso, lang, 'short');
  };
}

/** One notification row. Unread = bold text + an "Unread" label (never color alone). Clicking marks it read and follows its link. */
export function NotificationItem({ n, onRead, onNavigate, compact }: { n: AppNotification; onRead: (id: string) => void; onNavigate?: () => void; compact?: boolean }) {
  const { t } = useTranslation('notifications');
  const ago = useRelativeTime();
  const lang = useLang();
  const cats = useCategories();
  const { Icon, cls } = VISUAL[n.type];
  const link = notificationLink(n);
  const unread = !n.readAt;
  const title = budgetTitle(n, t, lang, cats.map) ?? n.message;

  const body = (
    <>
      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md', cls)} aria-hidden><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-base text-ink', unread ? 'font-semibold' : 'font-normal')} >{title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
          <span>{t(`type.${n.type}`)}</span>
          <time dateTime={n.createdAt}>{ago(n.createdAt)}</time>
          {link && !compact && <span className="font-medium text-accent">{t(link.labelKey)}</span>}
        </span>
      </span>
      <span className={cn('mt-1 flex shrink-0 items-center gap-1.5 text-xs', unread ? 'font-semibold text-accent' : 'text-ink-3')}>
        {unread && <i className="h-2 w-2 rounded-full bg-accent" aria-hidden />}
        <span className={compact ? 'sr-only' : undefined}>{unread ? t('unread') : t('read')}</span>
      </span>
    </>
  );
  const row = cn('flex w-full items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 md:px-2', compact && 'px-3 md:px-3');
  const click = () => { if (unread) onRead(n.id); onNavigate?.(); };

  return link
    ? <Link to={link.to} onClick={click} className={row}>{body}</Link>
    : <button type="button" onClick={click} className={row} aria-label={unread ? `${t('unread')}: ${title}` : undefined}>{body}</button>;
}

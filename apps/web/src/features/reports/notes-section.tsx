import { MessageSquareText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isApiError, usePeriod, useProfile, useTopNotes } from '@/api';
import { AmountText, Skeleton } from '@/ui';
import { Boundary, EmptyBlock, LockedCard, Section } from './parts';
import type { Kind } from './category-section';

const monthIndex = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7));

export function NotesSection({ period, kind }: { period?: string; kind: Kind }) {
  const { t } = useTranslation('reports');
  const premium = useProfile().data?.plan === 'PREMIUM';
  const { period: shown, current } = usePeriod();
  // same rule as the API: Free sees the current period and the 5 before it
  const locked = !premium && monthIndex(current) - monthIndex(shown) >= 6;
  // a locked period never asks the API (it would 403 and open the dialog uninvited)
  const q = useTopNotes(locked ? undefined : period, kind);
  const missing = isApiError(q.error) && (q.error.status === 404 || q.error.status === 501);
  return (
    <Section title={t('notes.title')} hint={t('notes.hint')}>
      {locked ? <LockedCard text={t('locked.period')} /> : missing ? <p className="text-sm text-ink-2">{t('notes.unavailable')}</p> : (
        <Boundary
          q={q} locked={t('locked.period')} skeleton={<div className="flex flex-col gap-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyBlock icon={MessageSquareText} title={t('notes.empty')}>{t('notes.emptyHint')}</EmptyBlock>}
        >
          {(d) => (
            <ol className="flex flex-col divide-y divide-line">
              {d.items.map((i, idx) => (
                <li key={`${i.note}-${idx}`} className="flex min-h-11 items-center gap-3 py-2">
                  <span className="num w-5 shrink-0 text-sm text-ink-3">{idx + 1}</span>
                  <span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-sm font-medium text-ink md:line-clamp-1" title={i.note}>{i.note}</span><span className="block text-xs text-ink-2">{t('notes.count', { count: i.count })}</span></span>
                  <AmountText amount={i.total} kind="balance" size="sm" className="shrink-0" />
                </li>
              ))}
            </ol>
          )}
        </Boundary>
      )}
    </Section>
  );
}

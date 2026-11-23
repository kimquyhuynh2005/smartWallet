import { ChartNoAxesColumn } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReportByCategory } from '@/api';
import { useCategories, categoryName } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { categoryVisual } from '@/lib/categories';
import { formatPercent } from '@/lib/format';
import { AmountText, Button, CategoryIcon, Skeleton } from '@/ui';
import { Boundary, EmptyBlock, Section, dayOf } from './parts';

export type Kind = 'EXPENSE' | 'INCOME';
const FOLD = 8;

export function CategorySection({ period, kind }: { period?: string; kind: Kind }) {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const q = useReportByCategory(period, kind);
  const cats = useCategories();
  const [all, setAll] = useState(false);
  const nameKey = kind === 'EXPENSE' ? 'expense' : 'income';
  return (
    <Section title={t('byCategory.title')} hint={t('byCategory.hint')}>
      <Boundary
        q={q} locked={t('locked.period')} skeleton={<div className="flex flex-col gap-3"><Skeleton className="h-6 w-40" />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>}
        isEmpty={(d) => d.items.length === 0 || d.total === 0}
        empty={<EmptyBlock icon={ChartNoAxesColumn} title={t(`byCategory.empty.${nameKey}`)}>{t('byCategory.emptyHint')}</EmptyBlock>}
      >
        {(d) => {
          const items = [...d.items].sort((a, b) => b.total - a.total);
                    const shown = all ? items : items.slice(0, FOLD);
          const from = dayOf(d.period.start);
          const to = dayOf(d.period.end, true);
          return (
            <div>
              <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-2">{t(`byCategory.total.${nameKey}`)} <AmountText amount={d.total} kind={kind === 'INCOME' ? 'income' : 'expense'} size="lg" /></p>
              <ol className="flex flex-col">
                {shown.map((i) => {
                  const cat = i.categoryId ? cats.map.get(i.categoryId) : undefined;
                  const like = cat ?? { nameEn: i.nameEn, nameVi: i.nameVi };
                  const { color } = categoryVisual(like);
                  const name = categoryName(i, lang);
                  const row = (
                    <>
                      <CategoryIcon category={like} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium text-ink">{name}</span>
                          <AmountText amount={i.total} kind="balance" size="sm" className="shrink-0" />
                        </span>
                        <span className="mt-1.5 flex items-center gap-3">
                          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden><span className="block h-full rounded-r-[4px]" style={{ width: `${Math.min(100, Math.max(1, i.percent))}%`, background: color }} /></span>
                          <span className="num w-12 shrink-0 text-right text-xs text-ink-2">{formatPercent(i.percent, lang)}</span>
                        </span>
                      </span>
                    </>
                  );
                  const cls = 'flex min-h-11 items-center gap-3 rounded-md px-1 py-2';
                  return (
                    <li key={i.categoryId ?? name}>
                      {i.categoryId
                        ? <Link to={`/transactions?categoryId=${i.categoryId}&from=${from}&to=${to}&type=${kind}`} className={`${cls} hover:bg-sunken`}>{row}<span className="sr-only">, {t('byCategory.open')}</span></Link>
                        : <div className={cls}>{row}</div>}
                    </li>
                  );
                })}
              </ol>
              {items.length > FOLD && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(!all)} aria-expanded={all}>{all ? t('byCategory.less') : t('byCategory.more', { count: items.length - FOLD })}</Button>}
            </div>
          );
        }}
      </Boundary>
    </Section>
  );
}

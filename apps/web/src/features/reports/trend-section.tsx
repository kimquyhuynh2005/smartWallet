import { Lock, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useProfile, useReportTrend } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatCompact, formatMoney, formatPeriodLabel } from '@/lib/format';
import { Tabs, TabsList, TabsTrigger } from '@/ui';
import { AXIS, Boundary, ChartSkeleton, ChartTip, EmptyBlock, LockedCard, Section } from './parts';

const short = (p: string) => `${p.slice(5, 7)}/${p.slice(2, 4)}`;

export function TrendSection() {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const premium = useProfile().data?.plan === 'PREMIUM';
  const [months, setMonths] = useState<6 | 12>(6);
  const locked = months === 12 && !premium;
  // a locked choice never asks for 12 months: the API would 403 and pop the dialog uninvited
  const q = useReportTrend(locked ? 6 : months);
  const toggle = (
    <Tabs value={String(months)} onValueChange={(v) => setMonths(v === '12' ? 12 : 6)}>
      <TabsList variant="segmented" aria-label={t('trend.range')}>
        <TabsTrigger value="6">{t('trend.m6')}</TabsTrigger>
        <TabsTrigger value="12">{!premium && <Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden />}{t('trend.m12')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
  return (
    <Section title={t('trend.title')} hint={t('trend.hint')} actions={toggle}>
      {locked ? <LockedCard text={t('locked.trend')} /> : (
        <Boundary
          q={q} locked={t('locked.trend')} skeleton={<ChartSkeleton h="h-64" />}
          isEmpty={(d) => d.points.every((p) => p.income === 0 && p.expense === 0)}
          empty={<EmptyBlock icon={TrendingUp} title={t('trend.empty')}>{t('trend.emptyHint')}</EmptyBlock>}
        >
          {(d) => {
            const data = d.points.map((p) => ({ name: short(p.period), income: p.income, expense: p.expense, net: p.net }));
            const fmt = (v: number) => formatMoney(v, lang);
            return (
              <figure>
                <div className="h-64 w-full" aria-hidden>
                  <ResponsiveContainer>
                    <ComposedChart data={data} barGap={2} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} interval="equidistantPreserveStart" minTickGap={16} />
                      <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatCompact(v, lang)} tick={AXIS} />
                      <ReferenceLine y={0} stroke="rgb(var(--line-strong))" />
                      <Tooltip cursor={{ fill: 'rgb(var(--sunken))' }} content={(p) => <ChartTip active={p.active} payload={p.payload} label={p.label} format={fmt} />} />
                      <Bar dataKey="income" name={t('income')} fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                      <Bar dataKey="expense" name={t('expense')} fill="rgb(var(--ink-2))" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                      <Line dataKey="net" name={t('net')} stroke="rgb(var(--ink))" strokeWidth={2.5} dot={{ r: 4, fill: 'rgb(var(--surface))', stroke: 'rgb(var(--ink))', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />{t('income')}</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-ink-2" aria-hidden />{t('expense')}</span>
                  <span className="flex items-center gap-1.5"><i className="h-0.5 w-3.5 rounded bg-ink" aria-hidden />{t('net')}</span>
                </figcaption>
                <details className="mt-3 text-sm">
                  <summary className="flex min-h-11 cursor-pointer items-center font-medium text-accent">{t('trend.table')}</summary>
                  <div className="overflow-x-auto">
                    <table className="num w-full min-w-[22rem] text-right">
                      <caption className="sr-only">{t('trend.title')}</caption>
                      <thead><tr className="text-ink-2"><th scope="col" className="py-1.5 text-left font-medium">{t('month')}</th><th scope="col" className="font-medium">{t('income')}</th><th scope="col" className="font-medium">{t('expense')}</th><th scope="col" className="font-medium">{t('net')}</th></tr></thead>
                      <tbody>{d.points.map((p) => (
                        <tr key={p.period} className="border-t border-line"><th scope="row" className="py-1.5 text-left font-normal text-ink">{formatPeriodLabel(p.period, lang)}</th><td>{formatCompact(p.income, lang)}</td><td>{formatCompact(p.expense, lang)}</td><td className="font-medium text-ink">{p.net > 0 ? '+' : ''}{formatCompact(p.net, lang)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </details>
              </figure>
            );
          }}
        </Boundary>
      )}
    </Section>
  );
}

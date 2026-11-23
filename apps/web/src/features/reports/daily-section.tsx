import { CalendarDays, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBudgets, useReportDaily } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatCompact, formatDate, formatMoney, vnDayKey } from '@/lib/format';
import { AXIS, niceCeil, Boundary, ChartSkeleton, ChartTip, EmptyBlock, Section } from './parts';

export function DailySection({ period }: { period?: string }) {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const q = useReportDaily(period);
  const budgets = useBudgets(period);
  const total = budgets.data?.find((b) => b.categoryId === null);
  const fmt = (v: number) => formatMoney(v, lang);
  return (
    <Section title={t('daily.title')} hint={t('daily.hint')}>
      <Boundary
        q={q} locked={t('locked.period')} skeleton={<ChartSkeleton h="h-64" />}
        isEmpty={(d) => d.days.every((x) => x.expense === 0)}
        empty={<EmptyBlock icon={CalendarDays} title={t('daily.empty')}>{t('daily.emptyHint')}</EmptyBlock>}
      >
        {(d) => {
          const today = vnDayKey(new Date());
          const n = d.days.length;
          let run = 0;
          const data = d.days.map((x, i) => {
            run += x.expense;
            return {
              date: x.date, name: x.date.slice(8), label: formatDate(`${x.date}T05:00:00Z`, lang, 'day'), expense: x.expense,
              cum: x.date > today ? null : run,
              pace: total ? Math.round((total.limitAmount * (i + 1)) / n) : undefined,
            };
          });
          const last = [...data].reverse().find((x) => x.cum !== null);
          let reading: { text: string; Icon: typeof Minus } | null = null;
          if (total && last?.pace) {
            const pct = Math.round(((last.cum ?? 0) / last.pace - 1) * 100);
            reading = Math.abs(pct) <= 3 ? { text: t('daily.pace.on'), Icon: Minus }
              : pct > 0 ? { text: t('daily.pace.fast', { percent: pct }), Icon: TrendingUp }
                : { text: t('daily.pace.slow', { percent: -pct }), Icon: TrendingDown };
          }
          const peak = data.reduce((a, b) => (b.expense > a.expense ? b : a), data[0]);
          return (
            <div className="flex flex-col gap-6">
              <figure>
                <div className="h-48 w-full" aria-hidden>
                  <ResponsiveContainer>
                    <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} interval="equidistantPreserveStart" minTickGap={16} />
                      <YAxis domain={[0, (max: number) => niceCeil(max)]} tickCount={5} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatCompact(v, lang)} tick={AXIS} />
                      <Tooltip cursor={{ fill: 'rgb(var(--sunken))' }} content={(p) => <ChartTip active={p.active} payload={p.payload} label={p.payload?.[0]?.payload?.label as string | undefined} format={fmt} />} />
                      <Bar dataKey="expense" name={t('expense')} fill="rgb(var(--ink-2))" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="mt-2 text-sm text-ink-2">{t('daily.peak', { date: peak.label, amount: formatMoney(peak.expense, lang, 'never') })}</figcaption>
                <div className="sr-only"><table>
                  <caption>{t('daily.title')}</caption>
                  <thead><tr><th scope="col">{t('daily.day')}</th><th scope="col">{t('expense')}</th><th scope="col">{t('daily.cumulative')}</th></tr></thead>
                  <tbody>{data.map((x) => <tr key={x.date}><th scope="row">{x.label}</th><td>{formatMoney(x.expense, lang, 'never')}</td><td>{x.cum === null ? '' : formatMoney(x.cum, lang, 'never')}</td></tr>)}</tbody>
                </table></div>
              </figure>
              {total && (
                <figure aria-describedby="pace-reading">
                  <h3 className="mb-1 text-base font-semibold text-ink">{t('daily.paceTitle')}</h3>
                  {reading && <p id="pace-reading" className="mb-3 flex items-start gap-1.5 text-sm text-ink-2"><reading.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{reading.text}</span></p>}
                  <div className="h-48 w-full" aria-hidden>
                    <ResponsiveContainer>
                      <LineChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} interval="equidistantPreserveStart" minTickGap={16} />
                        <YAxis domain={[0, (max: number) => niceCeil(max)]} tickCount={5} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatCompact(v, lang)} tick={AXIS} />
                        <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload} label={p.payload?.[0]?.payload?.label as string | undefined} format={fmt} />} />
                        <Line dataKey="pace" name={t('daily.pace.line')} stroke="rgb(var(--ink-3))" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                        <Line dataKey="cum" name={t('daily.cumulative')} stroke="rgb(var(--ink))" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
                    <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-ink" aria-hidden />{t('daily.cumulative')}</span>
                    <span className="flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed border-ink-3" aria-hidden />{t('daily.pace.line')}</span>
                  </figcaption>
                </figure>
              )}
            </div>
          );
        }}
      </Boundary>
    </Section>
  );
}

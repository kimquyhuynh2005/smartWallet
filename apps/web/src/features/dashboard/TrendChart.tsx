import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dashboard } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatCompact, formatMoney, formatPeriodLabel } from '@/lib/format';

/** the chart's height is fixed so the lazy placeholder (TrendFallback) holds exactly the same space */
export const TREND_HEIGHT = 'h-56';

export default function TrendChart({ points }: { points: Dashboard['trend'] }) {
  const { t } = useTranslation('dashboard');
  const lang = useLang();
  const data = points.map((p) => ({ name: p.period.slice(5), income: p.income, expense: p.expense }));
  return (
    <figure>
      <div className={`${TREND_HEIGHT} w-full`} aria-hidden>
        <ResponsiveContainer>
          <BarChart data={data} barGap={2} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--ink-2))', fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatCompact(v, lang)} tick={{ fill: 'rgb(var(--ink-2))', fontSize: 12 }} />
            <Tooltip cursor={{ fill: 'rgb(var(--sunken))' }} formatter={(v: number) => formatMoney(v, lang)} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--ink))', boxShadow: 'var(--shadow-float)' }} />
            <Bar dataKey="income" name={t('income')} fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="expense" name={t('expense')} fill="rgb(var(--ink-2))" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex gap-4 text-sm text-ink-2">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />{t('income')}</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-ink-2" aria-hidden />{t('expense')}</span>
      </figcaption>
      <div className="sr-only"><table>
        <caption>{t('trendTitle')}</caption>
        <thead><tr><th scope="col">{t('month')}</th><th scope="col">{t('income')}</th><th scope="col">{t('expense')}</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.period}><th scope="row">{formatPeriodLabel(p.period, lang)}</th><td>{formatMoney(p.income, lang)}</td><td>{formatMoney(p.expense, lang)}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}

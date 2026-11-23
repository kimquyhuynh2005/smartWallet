import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useAdminGrowth } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatPeriodLabel } from '@/lib/format';
import { Card, CardHeader, CardTitle, Skeleton } from '@/ui';
import { QueryState } from './shared';

type Point = { period: string; newUsers: number; totalUsers: number; premium: number };

const tick = { fill: 'rgb(var(--ink-2))', fontSize: 12 };
const tip = { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--ink))', fontSize: 13, boxShadow: 'var(--shadow-float)' };
// Two measures of different scale (monthly new vs cumulative) are never put on a dual axis: two charts, one axis each.
// Colours: accent (series 1) and the "transport" blue of the category palette (series 2); the second line is also dashed, so identity is not colour alone.
const C1 = 'rgb(var(--accent))';
const C2 = 'rgb(var(--cat-transport))';

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke={i.color} strokeWidth="3" strokeDasharray={i.dashed ? '4 3' : undefined} strokeLinecap="round" /></svg>{i.label}
        </li>
      ))}
    </ul>
  );
}

function Charts({ points }: { points: Point[] }) {
  const { t } = useTranslation('admin');
  const lang = useLang();
  const data = points.map((p) => ({ ...p, name: `${p.period.slice(5)}/${p.period.slice(2, 4)}` }));
  const label = (_: unknown, payload: readonly { payload?: Point }[]) => (payload[0]?.payload ? formatPeriodLabel(payload[0].payload.period, lang) : '');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <figure className="min-w-0">
        <figcaption className="mb-2 text-sm font-medium text-ink">{t('growth.newTitle')}</figcaption>
        <div className="h-52 w-full" aria-hidden>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={tick} interval={1} minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tick={tick} />
              <Tooltip cursor={{ fill: 'rgb(var(--sunken))' }} labelFormatter={label} contentStyle={tip} />
              <Bar dataKey="newUsers" name={t('growth.newUsers')} fill={C1} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className="min-w-0">
        <figcaption className="mb-2 text-sm font-medium text-ink">{t('growth.totalTitle')}</figcaption>
        <div className="h-52 w-full" aria-hidden>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={tick} interval={1} minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tick={tick} />
              <Tooltip labelFormatter={label} contentStyle={tip} />
              <Line type="monotone" dataKey="totalUsers" name={t('growth.total')} stroke={C1} strokeWidth={2} dot={{ r: 3, fill: 'rgb(var(--surface))', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="premium" name={t('growth.premium')} stroke={C2} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: 'rgb(var(--surface))', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: t('growth.total'), color: C1 }, { label: t('growth.premium'), color: C2, dashed: true }]} />
      </figure>
      <details className="lg:col-span-2">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-accent">{t('growth.table')}</summary>
        <div className="overflow-x-auto">
          <table className="num w-full text-left text-sm">
            <caption className="sr-only">{t('growth.title')}</caption>
            <thead className="text-ink-2"><tr className="border-b border-line"><th scope="col" className="py-2 pr-3 font-medium">{t('growth.month')}</th><th scope="col" className="py-2 pr-3 font-medium">{t('growth.newUsers')}</th><th scope="col" className="py-2 pr-3 font-medium">{t('growth.total')}</th><th scope="col" className="py-2 font-medium">{t('growth.premium')}</th></tr></thead>
            <tbody className="divide-y divide-line">{points.map((p) => <tr key={p.period}><th scope="row" className="py-1.5 pr-3 font-normal">{formatPeriodLabel(p.period, lang)}</th><td className="pr-3">{p.newUsers}</td><td className="pr-3">{p.totalUsers}</td><td>{p.premium}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function GrowthCard() {
  const { t } = useTranslation('admin');
  const q = useAdminGrowth(12);
  return (
    <Card>
      <CardHeader><CardTitle>{t('growth.title')}</CardTitle></CardHeader>
      <QueryState q={q} skeleton={<Skeleton className="h-52" />}>
        {(d) => d.points.length === 0 ? <p className="text-sm text-ink-2">{t('growth.empty')}</p> : <Charts points={d.points} />}
      </QueryState>
    </Card>
  );
}

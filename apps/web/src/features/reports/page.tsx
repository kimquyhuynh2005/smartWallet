import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePeriod, useReportByCategory } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/features/common/parts';
import { Tabs, TabsList, TabsTrigger } from '@/ui';
import { CategorySection, type Kind } from './category-section';
import { DailySection } from './daily-section';
import { ExportButton } from './export-button';
import { NotesSection } from './notes-section';
import { TrendSection } from './trend-section';

export default function ReportsPage() {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const { period, apiPeriod, label } = usePeriod();
  const [kind, setKind] = useState<Kind>('EXPENSE');
  // same query as the category section (shared cache): used only for the real date range of the period
  const info = useReportByCategory(apiPeriod, kind).data?.period;
  const range = info ? `${formatDate(info.start, lang, 'short')} – ${formatDate(new Date(new Date(info.end).getTime() - 1), lang, 'short')}` : undefined;
  const toggle = (
    <Tabs value={kind} onValueChange={(v) => setKind(v === 'INCOME' ? 'INCOME' : 'EXPENSE')}>
      <TabsList variant="segmented" aria-label={t('kind.label')}>
        <TabsTrigger value="EXPENSE">{t('expense')}</TabsTrigger>
        <TabsTrigger value="INCOME">{t('income')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
  return (
    <>
      <PageHeader title={t('title')} subtitle={range ? `${label} · ${range}` : label} actions={<ExportButton period={period} current={apiPeriod} />} />
      <div className="mb-4">{toggle}</div>
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <CategorySection period={apiPeriod} kind={kind} />
        <NotesSection period={apiPeriod} kind={kind} />
        <div className="lg:col-span-2"><TrendSection /></div>
        <div className="lg:col-span-2"><DailySection period={apiPeriod} /></div>
      </div>
    </>
  );
}

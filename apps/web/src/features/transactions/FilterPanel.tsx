import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryList, useWallets } from '@/api';
import { useLang } from '@/hooks/useLang';
import { Button, DatePicker, Field, MoneyInput, ResponsiveDialog, Select, Tabs, TabsList, TabsTrigger } from '@/ui';
import { categoryOptions } from './options';
import type { TxFilters, TxType } from './filters';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: TxFilters;
  /** the month picked in the top bar: what "from/to" mean when they are not set explicitly */
  bounds: { from: string; to: string };
  onApply: (patch: Partial<TxFilters>) => void;
}

/** Filter drawer: a bottom sheet on phones, a dialog from 768 px. Edits a draft; nothing changes until "Apply". */
export function FilterPanel({ open, onOpenChange, value, bounds, onApply }: Props) {
  const { t } = useTranslation('transactions');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const wallets = useWallets(true);
  const cats = useCategoryList();
  const [d, setD] = useState<TxFilters>(value);
  const [fromDay, setFrom] = useState(value.from ?? bounds.from);
  const [toDay, setTo] = useState(value.to ?? bounds.to);
  const catType = d.type === 'INCOME' || d.type === 'EXPENSE' ? d.type : undefined;
  const options = d.type === 'TRANSFER' ? [] : categoryOptions(cats.data, lang, catType);
  const rangeBad = fromDay > toDay;
  const amountBad = d.minAmount !== undefined && d.maxAmount !== undefined && d.minAmount > d.maxAmount;

  const apply = () => {
    onApply({
      type: d.type, walletId: d.walletId, categoryId: d.type === 'TRANSFER' ? undefined : d.categoryId, minAmount: d.minAmount, maxAmount: d.maxAmount,
      from: fromDay === bounds.from ? undefined : fromDay, to: toDay === bounds.to ? undefined : toDay,
    });
    onOpenChange(false);
  };
  const reset = () => { setD({ q: value.q }); setFrom(bounds.from); setTo(bounds.to); };

  return (
    <ResponsiveDialog
      open={open} onOpenChange={onOpenChange} title={t('filters.title')}
      footer={<>
        <Button onClick={apply} disabled={rangeBad || amountBad}>{t('filters.apply')}</Button>
        <Button variant="ghost" onClick={reset}>{t('filters.reset')}</Button>
      </>}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink">{t('filters.type')}</legend>
        <Tabs value={d.type ?? 'ALL'} onValueChange={(v) => setD({ ...d, type: v === 'ALL' ? undefined : (v as TxType), categoryId: v === 'TRANSFER' ? undefined : d.categoryId })}>
          <TabsList variant="segmented" className="flex w-full" aria-label={t('filters.type')}>
            {(['ALL', 'EXPENSE', 'INCOME', 'TRANSFER'] as const).map((k) => (
              <TabsTrigger key={k} value={k} className="flex-1 px-2">{k === 'ALL' ? tc('common.all') : t(k.toLowerCase())}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('filters.from')}><DatePicker value={fromDay} onChange={setFrom} shortcuts={false} max="" invalid={rangeBad} /></Field>
        <Field label={t('filters.to')} error={rangeBad ? t('filters.rangeBad') : undefined}><DatePicker value={toDay} onChange={setTo} shortcuts={false} max="" invalid={rangeBad} /></Field>
      </div>
      <Field label={t('form.wallet')}>
        <Select value={d.walletId ?? ''} onChange={(e) => setD({ ...d, walletId: e.target.value || undefined })} placeholder={t('filters.allWallets')} options={(wallets.data ?? []).map((w) => ({ value: w.id, label: w.isArchived ? `${w.name} (${t('filters.archived')})` : w.name }))} />
      </Field>
      <Field label={t('form.category')}>
        <Select value={d.categoryId ?? ''} disabled={d.type === 'TRANSFER'} onChange={(e) => setD({ ...d, categoryId: e.target.value || undefined })} placeholder={t('filters.allCategories')} options={options} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('filters.minAmount')}><MoneyInput value={d.minAmount ?? null} onChange={(v) => setD({ ...d, minAmount: v ?? undefined })} aria-label={t('filters.minAmount')} /></Field>
        <Field label={t('filters.maxAmount')} error={amountBad ? t('filters.amountBad') : undefined}><MoneyInput value={d.maxAmount ?? null} onChange={(v) => setD({ ...d, maxAmount: v ?? undefined })} aria-label={t('filters.maxAmount')} /></Field>
      </div>
    </ResponsiveDialog>
  );
}

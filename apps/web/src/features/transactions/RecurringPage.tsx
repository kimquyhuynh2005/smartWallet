import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CalendarClock, Pencil, Plus, Repeat, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import {
  applyFieldErrors, useCategoryList, useCreateRecurringRule, useDeleteRecurringRule, useRecurringRules, useUpdateRecurringRule, useWallets, type RecurringRule,
} from '@/api';
import { PageHeader } from '@/features/common/parts';
import { categoryName } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { formatDate, vnDayKey } from '@/lib/format';
import { toast } from '@/stores/ui';
import { AmountText, Badge, Button, buttonVariants, Card, CategoryIcon, DatePicker, Dialog, EmptyState, Field, Input, MoneyInput, ResponsiveDialog, Select, Skeleton, Tabs, TabsList, TabsTrigger } from '@/ui';
import { categoryOptions, walletOptions } from './options';

const FREQ = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
const startOfDay = (day: string) => new Date(`${day}T00:00:00+07:00`).toISOString();

function RuleForm({ rule, onClose }: { rule?: RecurringRule; onClose: () => void }) {
  const { t } = useTranslation('transactions');
  const lang = useLang();
  const wallets = useWallets(true);
  const cats = useCategoryList();
  const create = useCreateRecurringRule();
  const update = useUpdateRecurringRule();

  const schema = useMemo(() => z.object({
    type: z.enum(['EXPENSE', 'INCOME']),
    amount: z.number({ invalid_type_error: t('form.amountRequired'), required_error: t('form.amountRequired') }).int().positive(t('form.amountRequired')),
    walletId: z.string().min(1, t('form.walletRequired')),
    categoryId: z.string(),
    note: z.string().max(500, t('form.noteTooLong')),
    frequency: z.enum(FREQ),
    interval: z.number({ invalid_type_error: t('recurring.intervalBad') }).int().min(1, t('recurring.intervalBad')).max(365, t('recurring.intervalBad')),
    start: z.string().min(1),
    end: z.string(),
  }).refine((v) => !v.end || v.end > v.start, { path: ['end'], message: t('recurring.endBad') }), [t]);
  type Values = z.infer<typeof schema>;
  const initial: Values = rule
    ? { type: rule.type, amount: rule.amount, walletId: rule.walletId, categoryId: rule.categoryId ?? '', note: rule.note ?? '', frequency: rule.frequency, interval: rule.interval, start: vnDayKey(rule.nextRunAt), end: rule.endAt ? vnDayKey(rule.endAt) : '' }
    : { type: 'EXPENSE', amount: undefined as unknown as number, walletId: wallets.data?.find((w) => !w.isArchived)?.id ?? '', categoryId: '', note: '', frequency: 'MONTHLY', interval: 1, start: vnDayKey(new Date()), end: '' };
  const { control, register, handleSubmit, setError, setValue, watch, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const type = watch('type');
  const frequency = watch('frequency');
  const pending = create.isPending || update.isPending;

  const submit = handleSubmit(async (v) => {
    const body = {
      walletId: v.walletId, categoryId: v.categoryId || null, type: v.type, amount: v.amount, note: v.note.trim() || null,
      frequency: v.frequency, interval: v.interval, nextRunAt: startOfDay(v.start), endAt: v.end ? startOfDay(v.end) : null,
    };
    try {
      if (rule) await update.mutateAsync({ id: rule.id, body });
      else await create.mutateAsync(body);
      toast.success(rule ? t('recurring.saved') : t('recurring.created'));
      onClose();
    } catch (e) {
      applyFieldErrors(e, setError);
    }
  });

  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={rule ? t('recurring.editTitle') : t('recurring.newTitle')} description={t('recurring.formHint')}
      footer={<><Button onClick={submit} loading={pending}>{t('save')}</Button><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button></>}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Tabs value={type} onValueChange={(v) => { setValue('type', v as Values['type']); setValue('categoryId', ''); }}>
          <TabsList variant="segmented" className="flex w-full" aria-label={t('form.kind')}>
            <TabsTrigger value="EXPENSE" className="flex-1">{t('expense')}</TabsTrigger>
            <TabsTrigger value="INCOME" className="flex-1">{t('income')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Field label={t('form.amount')} error={errors.amount?.message} required>
          <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} autoFocus />} />
        </Field>
        <Field label={t('form.wallet')} error={errors.walletId?.message} required>
          <Select {...register('walletId')} placeholder={t('form.pickWallet')} options={walletOptions(wallets.data, rule?.walletId)} />
        </Field>
        <Field label={t('form.category')} optional>
          <Select {...register('categoryId')} placeholder={t('form.noCategory')} options={categoryOptions(cats.data, lang, type)} />
        </Field>
        <Field label={t('form.note')} error={errors.note?.message} optional><Input {...register('note')} maxLength={500} lang={lang} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('recurring.frequency')}>
            <Select {...register('frequency')} options={FREQ.map((f) => ({ value: f, label: t(`recurring.freq.${f}`) }))} />
          </Field>
          <Field label={t('recurring.every')} error={errors.interval?.message} hint={t(`recurring.unit.${frequency}`)}>
            <Input type="number" inputMode="numeric" min={1} max={365} {...register('interval', { valueAsNumber: true })} />
          </Field>
        </div>
        <Field label={t('recurring.start')}><Controller control={control} name="start" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} max="" />} /></Field>
        <Field label={t('recurring.end')} error={errors.end?.message} optional hint={t('recurring.endHint')}>
          <Controller control={control} name="end" render={({ field }) => (
            <div className="flex flex-col gap-2">
              <DatePicker value={field.value} onChange={field.onChange} shortcuts={false} max="" invalid={!!errors.end} />
              {field.value && <Button variant="ghost" size="sm" className="self-start" onClick={() => field.onChange('')}>{t('recurring.noEnd')}</Button>}
            </div>
          )} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveDialog>
  );
}

export default function RecurringPage() {
  const { t } = useTranslation('transactions');
  const lang = useLang();
  const rules = useRecurringRules();
  const wallets = useWallets(true);
  const cats = useCategoryList();
  const del = useDeleteRecurringRule();
  const [form, setForm] = useState<{ rule?: RecurringRule } | null>(null);
  const [confirm, setConfirm] = useState<RecurringRule | null>(null);
  const catMap = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data]);
  const walletName = (id: string) => wallets.data?.find((w) => w.id === id)?.name ?? '';

  const every = (r: RecurringRule) => (r.interval === 1 ? t(`recurring.freq.${r.frequency}`) : t(`recurring.everyN.${r.frequency}`, { count: r.interval }));
  const ruleTitle = (r: RecurringRule) => r.note || categoryName(catMap.get(r.categoryId ?? ''), lang, r.type === 'INCOME' ? t('income') : t('expense'));

  return (
    <>
      <Link to="/transactions" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-3 mb-1' })}><ArrowLeft className="h-4 w-4" aria-hidden />{t('title')}</Link>
      <PageHeader title={t('recurring.title')} subtitle={t('recurring.subtitle')} actions={<Button onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden />{t('recurring.add')}</Button>} />

      {rules.isLoading ? (
        <div className="flex flex-col gap-3" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : rules.isError ? (
        <EmptyState icon={TriangleAlert} title={t('loadError')} action={<Button variant="secondary" onClick={() => void rules.refetch()}>{t('retry')}</Button>}>{t('loadErrorHint')}</EmptyState>
      ) : !rules.data?.length ? (
        <EmptyState icon={Repeat} title={t('recurring.empty')} action={<Button onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden />{t('recurring.add')}</Button>}>{t('recurring.emptyHint')}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rules.data.map((r) => (
            <li key={r.id} className="min-w-0">
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-3">
                  <CategoryIcon category={catMap.get(r.categoryId ?? '')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-ink" lang={lang}>{ruleTitle(r)}</p>
                    <p className="truncate text-sm text-ink-2">{[every(r), walletName(r.walletId)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <AmountText amount={r.amount} kind={r.type === 'INCOME' ? 'income' : 'expense'} className="shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent" icon={<CalendarClock />}>{t('recurring.next', { date: formatDate(r.nextRunAt, lang, 'short') })}</Badge>
                  {r.endAt && <Badge>{t('recurring.until', { date: formatDate(r.endAt, lang, 'short') })}</Badge>}
                </div>
                <div className="mt-auto flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setForm({ rule: r })} aria-label={t('recurring.editAria', { name: ruleTitle(r) })}><Pencil className="h-4 w-4" aria-hidden />{t('edit')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(r)} aria-label={t('recurring.deleteAria', { name: ruleTitle(r) })}><Trash2 className="h-4 w-4" aria-hidden />{t('delete')}</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {form && <RuleForm key={form.rule?.id ?? 'new'} rule={form.rule} onClose={() => setForm(null)} />}
      {confirm && (
        <Dialog
          open onOpenChange={(o) => { if (!o) setConfirm(null); }} title={t('recurring.deleteTitle', { name: ruleTitle(confirm) })} description={t('recurring.deleteBody')}
          footer={<>
            <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate(confirm.id, { onSuccess: () => { toast.success(t('recurring.deleted')); setConfirm(null); } })}>{t('delete')}</Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t('cancel')}</Button>
          </>}
        >
          <p className="text-sm text-ink-2">{t('recurring.deleteKeep')}</p>
        </Dialog>
      )}
    </>
  );
}

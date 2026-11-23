import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyFieldErrors, useCategoryList, useUpdateTransaction, useWallets, type Transaction } from '@/api';
import { useLang } from '@/hooks/useLang';
import { vnDayKey } from '@/lib/format';
import { toast } from '@/stores/ui';
import { Button, DatePicker, Field, Input, MoneyInput, ResponsiveDialog, Select } from '@/ui';
import { dayToIso } from './filters';
import { categoryOptions, walletOptions } from './options';
import { useDeleteWithUndo } from './pendingDelete';

/** TXN-04: edit amount, note, category, wallet and date. A transfer only allows amount, note and date (the API refuses the rest). */
export function EditTransaction({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
  const { t } = useTranslation('transactions');
  const lang = useLang();
  const transfer = txn.type === 'TRANSFER';
  const cats = useCategoryList();
  const wallets = useWallets(true);
  const update = useUpdateTransaction();
  const remove = useDeleteWithUndo();

  const schema = useMemo(() => z.object({
    amount: z.number({ invalid_type_error: t('form.amountRequired'), required_error: t('form.amountRequired') }).int().positive(t('form.amountRequired')),
    note: z.string().max(500, t('form.noteTooLong')),
    categoryId: z.string(),
    walletId: z.string().min(1, t('form.walletRequired')),
    day: z.string().min(1),
  }), [t]);
  type Values = z.infer<typeof schema>;
  const initial: Values = { amount: txn.amount, note: txn.note ?? '', categoryId: txn.categoryId ?? '', walletId: txn.walletId, day: vnDayKey(txn.occurredAt) };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const { control, register, handleSubmit, setError, formState: { errors } } = form;

  const walletName = (id: string | null) => wallets.data?.find((w) => w.id === id)?.name ?? '…';
  const catList = categoryOptions(cats.data, lang, transfer ? undefined : (txn.type as 'INCOME' | 'EXPENSE'));

  const submit = handleSubmit(async (v) => {
    const body: Record<string, unknown> = {};
    if (v.amount !== txn.amount) body.amount = v.amount;
    if (v.note.trim() !== (txn.note ?? '')) body.note = v.note.trim() || null;
    if (v.day !== initial.day) body.occurredAt = dayToIso(v.day);
    if (!transfer) {
      if (v.walletId !== txn.walletId) body.walletId = v.walletId;
      if ((v.categoryId || null) !== txn.categoryId) body.categoryId = v.categoryId || null;
    }
    if (!Object.keys(body).length) { onClose(); return; }
    try {
      await update.mutateAsync({ id: txn.id, body });
      toast.success(t('saved'));
      onClose();
    } catch (e) {
      applyFieldErrors(e, setError);
    }
  });

  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={transfer ? t('editTransfer') : t('editTitle')}
      footer={<>
        <Button onClick={submit} loading={update.isPending}>{t('save')}</Button>
        <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      </>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {transfer && (
          <p className="flex flex-wrap items-center gap-2 rounded-md bg-sunken px-3 py-2 text-sm text-ink-2">
            <span className="font-medium text-ink">{walletName(txn.walletId)}</span><ArrowRight className="h-4 w-4" aria-hidden /><span className="sr-only">{t('to')}</span><span className="font-medium text-ink">{walletName(txn.transferWalletId)}</span>
            <span className="basis-full">{t('transferLocked')}</span>
          </p>
        )}
        <Field label={t('form.amount')} error={errors.amount?.message} required>
          <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} autoFocus />} />
        </Field>
        <Field label={t('form.note')} error={errors.note?.message} optional>
          <Input {...register('note')} maxLength={500} lang={lang} />
        </Field>
        {!transfer && (
          <>
            <Field label={t('form.category')} optional>
              <Select {...register('categoryId')} placeholder={t('form.noCategory')} options={catList} />
            </Field>
            <Field label={t('form.wallet')} error={errors.walletId?.message} required>
              <Select {...register('walletId')} options={walletOptions(wallets.data, txn.walletId)} />
            </Field>
          </>
        )}
        <Field label={t('form.date')}>
          <Controller control={control} name="day" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
      <Button variant="destructive" className="self-start" onClick={() => { remove(txn); onClose(); }}>
        <Trash2 className="h-4 w-4" aria-hidden />{t('delete')}
      </Button>
    </ResponsiveDialog>
  );
}

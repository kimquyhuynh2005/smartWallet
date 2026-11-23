import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Controller, useForm, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Keypad } from './Keypad';
import { applyOptimistic, type Draft } from './optimistic';
import { ReceiptPicker } from './ReceiptPicker';
import { useCategorySuggestion } from './useCategorySuggestion';
import { applyFieldErrors, endpoints, isApiError, qk, useCreateTransaction, useReceiptUploadUrl, useTransfer, useWallets, type TriggeredAlert } from '@/api';
import { useLang } from '@/hooks/useLang';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { vnDayKey } from '@/lib/format';
import { USE_MOCKS, seenAlertIds } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { toast, useUi } from '@/stores/ui';
import { Alert, Badge, Button, CategoryIcon, DatePicker, Field, MoneyInput, ResponsiveDialog, Select, controlClass } from '@/ui';

const LAST_WALLET = 'sw-last-wallet';
const readLast = () => { try { return localStorage.getItem(LAST_WALLET) ?? ''; } catch { return ''; } };
const writeLast = (id: string) => { try { localStorage.setItem(LAST_WALLET, id); } catch { /* storage may be blocked */ } };

type Mode = 'EXPENSE' | 'INCOME' | 'TRANSFER';
const MODES: Mode[] = ['EXPENSE', 'INCOME', 'TRANSFER'];
const occurredAtOf = (day: string) => (day === vnDayKey(new Date()) ? new Date().toISOString() : `${day}T05:00:00.000Z`); // noon in Vietnam for past days

/** POST the photo straight to S3 with the pre-signed fields (mocks have no S3, so the key alone is used) and return the key to send as receiptKey. */
async function uploadReceipt(file: File, getUrl: ReturnType<typeof useReceiptUploadUrl>['mutateAsync']): Promise<string> {
  const up = await getUrl({ contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp', size: file.size });
  if (!USE_MOCKS) {
    const body = new FormData();
    for (const [k, v] of Object.entries(up.fields)) body.append(k, v);
    body.append('file', file); // the file must be the last field of a pre-signed POST
    const res = await fetch(up.url, { method: 'POST', body });
    if (!res.ok) throw new Error('receipt upload failed');
  }
  return up.key;
}

/**
 * The amount field. `Field` injects id / aria-* into its direct child; a bare `Controller` would swallow them
 * (the label then pointed at nothing), so the injected props are forwarded to the real input here.
 */
function AmountControl<T extends FieldValues>({ control, inputRef, keypadMode, id, invalid, ...aria }: {
  control: Control<T>; inputRef: MutableRefObject<HTMLInputElement | null>; keypadMode: boolean;
  id?: string; invalid?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean;
}) {
  return (
    <Controller control={control} name={'amount' as Path<T>} render={({ field }) => (
      <MoneyInput
        autoFocus id={id} invalid={invalid} aria-describedby={aria['aria-describedby']} aria-invalid={aria['aria-invalid']}
        value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur}
        ref={(el) => { field.ref(el); inputRef.current = el; }}
        {...(keypadMode ? { readOnly: true, inputMode: 'none' as const } : {})}
        className={keypadMode ? 'min-h-14 text-2xl' : undefined}
      />
    )} />
  );
}

/**
 * The global "add transaction" sheet (mobile) / dialog (desktop), TXN-01/02 + CAT-03.
 * Open -> amount (focused, on-screen keypad on phones) -> Save = 3 taps. The save is optimistic: lists, wallet balances and budget bars move at once and roll back on error.
 */
export function QuickAdd() {
  const { t, i18n } = useTranslation('quick-add');
  const lang = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const open = useUi((s) => s.quickAddOpen);
  const init = useUi((s) => s.quickAddInit);
  const close = useUi((s) => s.closeQuickAdd);
  const keypadMode = useMediaQuery('(max-width: 767px), (pointer: coarse)');
  const [touched, setTouched] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptFailed, setReceiptFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const amountEl = useRef<HTMLInputElement | null>(null);

  const schema = useMemo(() => z.object({
    type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
    amount: z.number({ invalid_type_error: t('amountRequired'), required_error: t('amountRequired') }).int(t('amountRequired')).positive(t('amountRequired')),
    walletId: z.string().min(1, t('walletRequired')),
    toWalletId: z.string(),
    note: z.string().max(500, t('noteTooLong')),
    categoryId: z.string(),
    date: z.string(),
  }).superRefine((v, ctx) => {
    if (v.type !== 'TRANSFER') return;
    if (!v.toWalletId) ctx.addIssue({ code: 'custom', path: ['toWalletId'], message: t('toWalletRequired') });
    else if (v.toWalletId === v.walletId) ctx.addIssue({ code: 'custom', path: ['toWalletId'], message: t('sameWallet') });
  }), [t]);
  type Form = z.infer<typeof schema>;
  const blank = (walletId: string, type: Mode = 'EXPENSE'): Form => ({ type, amount: undefined as unknown as number, walletId, toWalletId: '', note: '', categoryId: '', date: vnDayKey(new Date()) });

  const walletsQ = useWallets(false);
  const wallets = useMemo(() => (walletsQ.data ?? []).filter((w) => !w.isArchived), [walletsQ.data]); // archived wallets are never offered
  const categories = useQuery({ queryKey: qk.categories.all, queryFn: () => endpoints.categories.list(), enabled: open, staleTime: 5 * 60_000 });
  const create = useCreateTransaction();
  const transfer = useTransfer();
  const uploadUrl = useReceiptUploadUrl();

  const { control, register, handleSubmit, watch, setValue, getValues, reset, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: blank('') });
  const type = watch('type');
  const note = watch('note');
  const amount = watch('amount');
  const walletId = watch('walletId');
  const toWalletId = watch('toWalletId');
  const categoryId = watch('categoryId');
  const isTransfer = type === 'TRANSFER';
  const { suggestions, preselectedId, isLoading: suggesting } = useCategorySuggestion(isTransfer ? '' : note, amount || undefined, isTransfer ? 'EXPENSE' : type);

  // every open starts clean (keeping the wallet) and honours what the caller asked for (mode / wallet / category)
  useEffect(() => {
    if (!open) return;
    reset({ ...blank(init?.walletId ?? getValues('walletId'), init?.mode ?? 'EXPENSE'), categoryId: init?.categoryId ?? '' });
    setTouched(!!init?.categoryId);
    setReceipt(null);
    setReceiptFailed(false);
    const id = setTimeout(() => amountEl.current?.focus(), 80); // Radix focuses the first tabbable element; the amount wins
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, init]);

  // focus restore: the dialog is opened from the store (no Radix trigger), so remember the opener and give focus back on close
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { // layout effect: runs before Radix moves focus into the dialog
    if (open) {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el !== document.body) opener.current = el;
      return;
    }
    const el = opener.current;
    opener.current = null;
    if (!el) return;
    const id = setTimeout(() => { if (el.isConnected) el.focus(); }, 0);
    return () => clearTimeout(id);
  }, [open]);

  // default wallet: the one used last, else the first; a wallet that disappeared or got archived is replaced
  useEffect(() => {
    if (!open || !wallets.length) return;
    if (!wallets.some((w) => w.id === walletId)) {
      const last = readLast();
      setValue('walletId', wallets.find((w) => w.id === last)?.id ?? wallets[0].id);
    }
    if (isTransfer && (!toWalletId || toWalletId === walletId || !wallets.some((w) => w.id === toWalletId))) {
      setValue('toWalletId', wallets.find((w) => w.id !== walletId)?.id ?? '');
    }
  }, [open, wallets, walletId, toWalletId, isTransfer, setValue]);

  // the category select is uncontrolled: a value set BEFORE its options exist (cold cache) is dropped by the DOM, so re-apply it once they do
  useEffect(() => { const v = getValues('categoryId'); if (open && v) setValue('categoryId', v); }, [open, categories.data, type, getValues, setValue]);

  // CAT-03: pre-select the best suggestion (>= 0.6) unless the user already picked a category
  useEffect(() => { if (open && !touched && !isTransfer && preselectedId) setValue('categoryId', preselectedId); }, [open, touched, isTransfer, preselectedId, setValue]);
  // switching kind clears a category of the other kind
  useEffect(() => {
    const c = categories.data?.find((x) => x.id === categoryId);
    if (c && (isTransfer || c.type !== type)) { setValue('categoryId', ''); setTouched(false); }
  }, [type, isTransfer, categoryId, categories.data, setValue]);

  const label = useCallback((c: { nameVi: string; nameEn: string }) => (i18n.language === 'en' ? c.nameEn : c.nameVi), [i18n.language]);
  const catOptions = (categories.data ?? []).filter((c) => c.type === type).map((c) => ({ value: c.id, label: (c.parentId ? '- ' : '') + label(c) }));

  /** built in the UI language from percent + category; the stored message is only a fallback */
  const alertTitle = (a: TriggeredAlert) => {
    const pct = Math.floor(a.percentUsed);
    if (!a.categoryId) return t('alert.titleTotal', { pct });
    const c = categories.data?.find((x) => x.id === a.categoryId);
    return c ? t('alert.title', { pct, name: label(c) }) : a.message;
  };

  const alertToast = (a: TriggeredAlert) => {
    seenAlertIds.add(a.id); // the socket must not toast it a second time
    const exceeded = a.type === 'BUDGET_EXCEEDED';
    toast.show({
      kind: exceeded ? 'error' : 'warning', title: alertTitle(a), description: t(exceeded ? 'alert.exceeded' : 'alert.warning'),
      action: { label: t('alert.open'), onClick: () => navigate(a.categoryId ? `/budgets/category/${a.categoryId}` : '/budgets') },
    });
  };

  const submit = async (v: Form, again: boolean, skipReceipt = false) => {
    setSaving(true);
    setReceiptFailed(false);
    try {
      let receiptKey: string | undefined;
      if (receipt && !skipReceipt && v.type !== 'TRANSFER') {
        try { receiptKey = await uploadReceipt(receipt, uploadUrl.mutateAsync); } catch { setReceiptFailed(true); return; } // the entered data stays; the user decides
      }
      const occurredAt = occurredAtOf(v.date);
      const noteText = v.note.trim();
      const draft: Draft = {
        type: v.type, amount: v.amount, walletId: v.walletId, transferWalletId: v.type === 'TRANSFER' ? v.toWalletId : null,
        categoryId: v.type === 'TRANSFER' ? null : v.categoryId || null, note: noteText || null, occurredAt,
      };
      const optimistic = applyOptimistic(qc, draft);
      let alerts: TriggeredAlert[] = [];
      try {
        if (v.type === 'TRANSFER') {
          await transfer.mutateAsync({ fromWalletId: v.walletId, toWalletId: v.toWalletId, amount: v.amount, ...(noteText ? { note: noteText } : {}), occurredAt });
        } else {
          const res = await create.mutateAsync({
            walletId: v.walletId, type: v.type, amount: v.amount, occurredAt,
            ...(noteText ? { note: noteText } : {}), ...(v.categoryId ? { categoryId: v.categoryId } : {}), ...(receiptKey ? { receiptKey } : {}),
          });
          alerts = res.triggeredAlerts;
          alerts.forEach((a) => seenAlertIds.add(a.id)); // register first so the socket does not toast it again
        }
      } catch (e) {
        optimistic.rollback();
        if (isApiError(e) && e.code === 'WALLET_ARCHIVED') {
          setError('walletId', { type: 'server', message: t('walletArchived') });
          void qc.invalidateQueries({ queryKey: qk.wallets.all });
        } else applyFieldErrors(e, setError); // anything else was already announced by the global error toast
        return;
      }
      writeLast(v.walletId);
      alerts.forEach(alertToast);
      if (alerts.length === 0) toast.success(t(v.type === 'TRANSFER' ? 'savedTransfer' : 'saved'));
      reset({ ...blank(v.walletId, v.type), toWalletId: v.toWalletId });
      setTouched(false);
      setReceipt(null);
      if (again) setTimeout(() => amountEl.current?.focus(), 50);
      else close();
    } finally {
      setSaving(false);
    }
  };

  const onValid = (again: boolean) => handleSubmit((v) => submit(v, again));
  const enoughForTransfer = wallets.length >= 2;

  const noteAndChips = (
    <>
        <Field label={t('note')} error={errors.note?.message} optional>
          <textarea {...register('note')} rows={2} maxLength={500} placeholder={t('notePlaceholder')} autoComplete="off" enterKeyHint="done" lang={lang} className={cn(controlClass, 'resize-none border-line-strong py-2 hover:border-ink-3')} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
        </Field>

        {!isTransfer && (
          <div className="flex min-h-[5.5rem] flex-col gap-2">
            {(suggestions.length > 0 || suggesting) && <>
            <p className="flex items-center gap-1.5 text-sm text-ink-2" aria-live="polite">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />{suggesting && suggestions.length === 0 ? t('suggestionsLoading') : t('suggestions')}
            </p>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((s) => {
                const on = categoryId === s.categoryId;
                return (
                  <li key={s.categoryId}>
                    <button
                      type="button" aria-pressed={on} onClick={() => { setTouched(true); setValue('categoryId', s.categoryId); }}
                      className={cn('flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-sm transition-colors', on ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-ink-2 hover:bg-sunken')}
                    >
                      <CategoryIcon category={s} size="sm" className="!h-8 !w-8 rounded-full" />
                      <span>{label(s)}</span>
                      <span className="sr-only">{t('sure', { percent: Math.round(s.confidence * 100) })}</span>
                      {s.categoryId === preselectedId && <Badge tone="accent" className="!py-0">{t('suggested')}</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
            </>}
          </div>
        )}

    </>
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && !saving && close()} title={t('title')}>
      <form className="flex flex-col gap-4" onSubmit={onValid(false)} noValidate>
        <div role="radiogroup" aria-label={t('type')} className="grid grid-cols-3 rounded-md border border-line bg-sunken p-1">
          {MODES.map((k) => (
            <button
              key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setValue('type', k)}
              className={cn('min-h-11 rounded-sm px-1 text-base font-medium transition-colors', type === k ? 'bg-surface text-ink shadow-[0_0_0_1px_rgb(var(--line))]' : 'text-ink-2 hover:text-ink')}
            >
              {t(k === 'EXPENSE' ? 'expense' : k === 'INCOME' ? 'income' : 'transfer')}
            </button>
          ))}
        </div>

        {!walletsQ.isLoading && wallets.length === 0 && <Alert tone="warning">{t('noWallets')}</Alert>}
        {isTransfer && wallets.length > 0 && !enoughForTransfer && <Alert tone="warning">{t('needTwoWallets')}</Alert>}

        <Field label={t('amount')} error={errors.amount?.message} required>
          <AmountControl control={control} inputRef={amountEl} keypadMode={keypadMode} />
        </Field>
        {keypadMode && noteAndChips}
        {keypadMode && <Controller control={control} name="amount" render={({ field }) => <Keypad value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} />} />}

        {isTransfer && (
          <div className="grid gap-3">
            <Field label={t('fromWallet')} error={errors.walletId?.message} required>
              <Select {...register('walletId')} options={wallets.map((w) => ({ value: w.id, label: w.name }))} />
            </Field>
            <ArrowDown className="mx-auto -my-1 h-5 w-5 text-ink-3" aria-hidden />
            <Field label={t('toWallet')} error={errors.toWalletId?.message} required>
              <Select {...register('toWalletId')} options={wallets.map((w) => ({ value: w.id, label: w.name, disabled: w.id === walletId }))} />
            </Field>
          </div>
        )}

        {!keypadMode && noteAndChips}

        {!isTransfer && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('category')} optional>
              <Select {...register('categoryId', { onChange: () => setTouched(true) })} options={catOptions} placeholder={t('categoryPlaceholder')} />
            </Field>
            <Field label={t('wallet')} error={errors.walletId?.message} required>
              <Select {...register('walletId')} options={wallets.map((w) => ({ value: w.id, label: w.name }))} />
            </Field>
          </div>
        )}

        <Field label={t('date')}>
          <Controller control={control} name="date" render={({ field }) => <DatePicker id="quick-add-date" aria-label={t('date')} value={field.value} onChange={field.onChange} />} />
        </Field>

        {!isTransfer && <ReceiptPicker file={receipt} onChange={(f) => { setReceipt(f); setReceiptFailed(false); }} disabled={saving} />}
        {receiptFailed && (
          <Alert tone="warning">
            <p>{t('receipt.failed')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={onValid(false)} disabled={saving}>{t('receipt.retry')}</Button>
              <Button size="sm" onClick={handleSubmit((v) => submit(v, false, true))} disabled={saving}>{t('receipt.skip')}</Button>
            </div>
          </Alert>
        )}

        {/* sticky so Save stays on screen however long the form is: open -> amount -> Save */}
        <div className="sticky bottom-[calc(-1*max(1.25rem,env(safe-area-inset-bottom)))] -mx-4 -mb-[max(1.25rem,env(safe-area-inset-bottom))] grid grid-cols-[2fr_3fr] gap-2 border-t border-line bg-surface px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 md:bottom-[-1.5rem] md:-mx-6 md:-mb-6 md:px-6 md:pb-4">
          <Button variant="secondary" size="lg" className="whitespace-normal leading-tight" disabled={saving} onClick={onValid(true)}>{t('saveAndNext')}</Button>
          <Button type="submit" size="lg" loading={saving}>{t(isTransfer ? 'saveTransfer' : 'save')}</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

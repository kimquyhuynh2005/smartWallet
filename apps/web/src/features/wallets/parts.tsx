import { zodResolver } from '@hookform/resolvers/zod';
import { Banknote, Check, CreditCard, Landmark, Smartphone, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyFieldErrors, isPlanLimit, useCreateWallet, useDeleteWallet, useTransactions, useUpdateWallet, type Wallet } from '@/api';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';
import { Alert, Button, Field, Input, MoneyInput, ResponsiveDialog } from '@/ui';

export type WalletType = Wallet['type'];
export const WALLET_TYPES: WalletType[] = ['CASH', 'BANK', 'EWALLET', 'CREDIT'];
export const TYPE_ICON: Record<WalletType, LucideIcon> = { CASH: Banknote, BANK: Landmark, EWALLET: Smartphone, CREDIT: CreditCard };

/** curated muted palette (the design tokens' category hues): a wallet color is picked, never typed */
export const PALETTE = ['#2C7A58', '#4F955F', '#2F8A85', '#4F6FA3', '#5666A6', '#B2506F', '#BC4A43', '#B85C38', '#A8841A', '#8C7442', '#737A74'] as const;
const FALLBACK = '#737A74';

/** the wallet's own colour as a soft tile with its type icon (the type name is always printed next to it) */
export function WalletGlyph({ type, color, size = 'md' }: { type: WalletType; color: string | null; size?: 'md' | 'lg' }) {
  const Icon = TYPE_ICON[type];
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : FALLBACK;
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-md', size === 'lg' ? 'h-12 w-12 [&>svg]:h-6 [&>svg]:w-6' : 'h-10 w-10 [&>svg]:h-5 [&>svg]:w-5')} style={{ color: c, backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      <Icon strokeWidth={1.75} />
    </span>
  );
}

/** WAL-01 create / edit */
export function WalletForm({ wallet, onClose, onSaved }: { wallet?: Wallet; onClose: () => void; onSaved?: (w: Wallet) => void }) {
  const { t } = useTranslation('wallets');
  const create = useCreateWallet();
  const update = useUpdateWallet();
  const schema = useMemo(() => z.object({
    name: z.string().trim().min(1, t('form.nameRequired')).max(100, t('form.nameTooLong')),
    type: z.enum(['CASH', 'BANK', 'EWALLET', 'CREDIT']),
    openingBalance: z.number().int().nullable(),
    color: z.string(),
  }), [t]);
  type Values = z.infer<typeof schema>;
  const { control, register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: wallet?.name ?? '', type: wallet?.type ?? 'CASH', openingBalance: wallet?.openingBalance ?? 0, color: wallet?.color ?? PALETTE[0] },
  });

  const submit = handleSubmit(async (v) => {
    try {
      let saved: Wallet;
      if (wallet) {
        const body: Record<string, unknown> = {};
        if (v.name !== wallet.name) body.name = v.name;
        if (v.type !== wallet.type) body.type = v.type;
        if ((v.openingBalance ?? 0) !== wallet.openingBalance) body.openingBalance = v.openingBalance ?? 0;
        if (v.color !== wallet.color) body.color = v.color;
        if (!Object.keys(body).length) { onClose(); return; }
        saved = await update.mutateAsync({ id: wallet.id, body });
        toast.success(t('saved'));
      } else {
        saved = await create.mutateAsync({ name: v.name, type: v.type, openingBalance: v.openingBalance ?? 0, color: v.color });
        toast.success(t('created', { name: saved.name }));
      }
      onSaved?.(saved);
      onClose();
    } catch (e) {
      if (isPlanLimit(e)) onClose(); // the global plan dialog is already open: do not leave this form stacked behind it
      else applyFieldErrors(e, setError);
    }
  });

  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={wallet ? t('form.editTitle') : t('form.newTitle')}
      footer={<><Button onClick={submit} loading={create.isPending || update.isPending}>{t('save')}</Button><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button></>}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('form.name')} error={errors.name?.message} required>
          <Input {...register('name')} placeholder={t('form.namePlaceholder')} maxLength={100} autoFocus autoComplete="off" />
        </Field>
        <Controller control={control} name="type" render={({ field }) => (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-ink">{t('form.type')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {WALLET_TYPES.map((k) => {
                const Icon = TYPE_ICON[k];
                const on = field.value === k;
                return (
                  <label key={k} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-base transition-colors focus-within:ring-2 focus-within:ring-accent/40', on ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-ink hover:bg-sunken')}>
                    <input type="radio" className="sr-only" name="wallet-type" checked={on} onChange={() => field.onChange(k)} />
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />{t(`types.${k}`)}
                    {on && <Check className="ml-auto h-4 w-4" aria-hidden />}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )} />
        <Field label={t('form.opening')} hint={wallet ? t('form.openingEditHint') : t('form.openingHint')}>
          <Controller control={control} name="openingBalance" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Controller control={control} name="color" render={({ field }) => (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">{t('form.color')}</legend>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <label key={c} className="relative">
                  <input type="radio" name="wallet-color" className="peer sr-only" checked={field.value === c} onChange={() => field.onChange(c)} aria-label={t(`colors.${c.slice(1)}`)} />
                  <span className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-transparent peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent" style={{ backgroundColor: c }}>
                    {field.value === c && <Check className="h-5 w-5 text-white" aria-hidden />}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveDialog>
  );
}

/** WAL-01 delete: soft-deletes the wallet AND every transaction that touches it. The consequence is spelled out with the real count. */
export function DeleteWalletDialog({ wallet, onClose, onDeleted }: { wallet: Wallet; onClose: () => void; onDeleted?: () => void }) {
  const { t } = useTranslation('wallets');
  const del = useDeleteWallet();
  const count = useTransactions({ walletId: wallet.id, limit: 1 });
  const total = count.data?.meta.total ?? 0;
  const [ack, setAck] = useState(false);
  const needsAck = total > 0;
  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={t('delete.title', { name: wallet.name })}
      footer={<>
        <Button variant="destructive" loading={del.isPending} disabled={count.isLoading || (needsAck && !ack)} onClick={() => del.mutate(wallet.id, { onSuccess: () => { toast.success(t('delete.done', { name: wallet.name })); onClose(); onDeleted?.(); } })}>{t('delete.confirm')}</Button>
        <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      </>}
    >
      <Alert tone="warning">
        {count.isLoading ? t('delete.counting') : total > 0 ? t('delete.consequence', { count: total }) : t('delete.consequenceEmpty')}
      </Alert>
      <p className="text-sm text-ink-2">{t('delete.explain')}</p>
      <p className="text-sm text-ink-2">{t('delete.archiveHint')}</p>
      {needsAck && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
          <input type="checkbox" autoFocus className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--danger))]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {t('delete.ack', { count: total })}
        </label>
      )}
    </ResponsiveDialog>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyFieldErrors, describeError, isApiError, isPlanLimit, useContributeToGoal, useCreateGoal, useUpdateGoal, type Goal } from '@/api';
import { vnDayKey } from '@/lib/format';
import { toast } from '@/stores/ui';
import { Alert, AmountText, Button, DatePicker, Field, Input, MoneyInput, ResponsiveDialog, Tabs, TabsList, TabsTrigger } from '@/ui';

const asDeadline = (day: string) => `${day}T05:00:00.000Z`; // noon in Vietnam, so the calendar day never shifts

/** create (goal = undefined) or edit a goal. The Free plan cap (403) opens the global upgrade dialog. */
export function GoalFormDialog({ open, goal, onClose, onSaved }: { open: boolean; goal?: Goal; onClose: () => void; onSaved?: (g: Goal) => void }) {
  const { t } = useTranslation('goals');
  const { t: tc } = useTranslation();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const schema = useMemo(() => z.object({
    name: z.string().trim().min(1, t('form.nameRequired')).max(100),
    target: z.number({ invalid_type_error: t('form.targetRequired'), required_error: t('form.targetRequired') }).int().positive(t('form.targetRequired')),
    deadline: z.string(),
  }), [t]);
  type F = z.infer<typeof schema>;
  const { control, register, handleSubmit, reset, setError, watch, setValue, formState: { errors } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { name: '', deadline: '' } });
  useEffect(() => {
    if (open) { reset({ name: goal?.name ?? '', target: goal?.targetAmount, deadline: goal?.deadline ? vnDayKey(goal.deadline) : '' }); create.reset(); update.reset(); }
  }, [open, goal]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = create.isPending || update.isPending;
  const target = watch('target');
  const deadline = watch('deadline');
  const done = (g: Goal, msg: string) => { toast.success(msg); onSaved?.(g); onClose(); };
  const submit = handleSubmit((v) => {
    if (goal) {
      update.mutate({ id: goal.id, body: { name: v.name, targetAmount: v.target, deadline: v.deadline ? asDeadline(v.deadline) : null } }, {
        onSuccess: (g) => done(g, t('toast.updated')), onError: (e) => { if (isPlanLimit(e)) onClose(); else applyFieldErrors(e, setError); },
      });
    } else {
      create.mutate({ name: v.name, targetAmount: v.target, ...(v.deadline ? { deadline: asDeadline(v.deadline) } : {}) }, {
        onSuccess: (g) => done(g, t('toast.created')), onError: (e) => { if (isPlanLimit(e)) onClose(); else applyFieldErrors(e, setError); },
      });
    }
  });
  const err = goal ? update.error : create.error;

  return (
    <ResponsiveDialog
      open={open} onOpenChange={(o) => !o && onClose()} title={goal ? t('form.editTitle') : t('form.createTitle')}
      footer={<><Button size="lg" type="submit" form="goal-form" loading={pending}>{goal ? t('form.save') : t('form.create')}</Button><Button size="lg" variant="ghost" onClick={onClose}>{tc('common.cancel')}</Button></>}
    >
      <form id="goal-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <Field label={t('form.name')} error={errors.name?.message} required>
          <Input autoFocus maxLength={100} placeholder={t('form.namePlaceholder')} {...register('name')} />
        </Field>
        <Field label={t('form.target')} error={errors.target?.message} hint={goal && target && target < goal.savedAmount ? t('form.targetBelowSaved') : undefined} required>
          {/* Field injects id/aria-* into its direct child and a bare Controller drops them: give the input a fixed id the label can point at */}
          <Controller {...({ id: 'goal-target' } as object)} control={control} name="target" render={({ field }) => <MoneyInput id="goal-target" aria-invalid={errors.target ? true : undefined} value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} />} />
        </Field>
        <Field label={t('form.deadline')} hint={t('form.deadlineHint')} optional>
          <DatePicker value={deadline} onChange={(v) => setValue('deadline', v, { shouldDirty: true })} shortcuts={false} />
        </Field>
        {deadline && <Button variant="ghost" size="sm" className="self-start" onClick={() => setValue('deadline', '', { shouldDirty: true })}>{t('form.clearDeadline')}</Button>}
                {err && !isPlanLimit(err) && !(isApiError(err) && err.code === 'VALIDATION_ERROR') && <Alert tone="danger">{describeError(err, tc)}</Alert>}
      </form>
    </ResponsiveDialog>
  );
}

/** deposit or withdraw. A withdrawal can never exceed what is saved: checked here and enforced by the API (error shown in plain words). */
export function ContributeDialog({ goal, onClose, onAchieved }: { goal: Goal | null; onClose: () => void; onAchieved?: (g: Goal) => void }) {
  const { t } = useTranslation('goals');
  const { t: tc } = useTranslation();
  const contribute = useContributeToGoal();
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (goal) { setMode('deposit'); setAmount(null); setNote(''); setTouched(false); contribute.reset(); } }, [goal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const withdraw = mode === 'withdraw';
  const tooMuch = !!goal && withdraw && !!amount && amount > goal.savedAmount;
  const fieldError = touched && !amount ? t('contribute.amountRequired') : tooMuch ? t('contribute.tooMuch') : undefined;

  const submit = () => {
    if (!goal) return;
    setTouched(true);
    if (!amount || amount <= 0 || tooMuch) return;
    const before = goal.status;
    contribute.mutate({ id: goal.id, body: { amount: withdraw ? -amount : amount, ...(note.trim() ? { note: note.trim() } : {}) } }, {
      onSuccess: (r) => {
        toast.success(withdraw ? t('toast.withdrawn') : t('toast.contributed'));
        if (r.goal.status === 'ACHIEVED' && before !== 'ACHIEVED') onAchieved?.(r.goal);
        onClose();
      },
    });
  };
  const e = contribute.error;
  const apiMsg = !e || isPlanLimit(e) ? null
    : isApiError(e) && (e.code === 'INSUFFICIENT_GOAL_BALANCE' || (withdraw && [400, 409, 422].includes(e.status) && e.code !== 'VALIDATION_ERROR' && e.code !== 'GOAL_NOT_ACTIVE')) ? t('contribute.errTooMuch')
    : isApiError(e) && e.code === 'GOAL_NOT_ACTIVE' ? t('contribute.errClosed')
    : describeError(e, tc);

  return (
    <ResponsiveDialog
      open={!!goal} onOpenChange={(o) => !o && onClose()} title={t('contribute.title')} description={goal ? t('contribute.titleFor', { name: goal.name }) : undefined}
      footer={<><Button size="lg" type="submit" form="contribute-form" loading={contribute.isPending}>{withdraw ? t('contribute.submitWithdraw') : t('contribute.submitDeposit')}</Button><Button size="lg" variant="ghost" onClick={onClose}>{tc('common.cancel')}</Button></>}
    >
      <form id="contribute-form" className="flex flex-col gap-4" onSubmit={(ev) => { ev.preventDefault(); submit(); }} noValidate>
        <Tabs value={mode} onValueChange={(v) => { setMode(v as 'deposit' | 'withdraw'); contribute.reset(); }}>
          <TabsList variant="segmented" className="w-full" aria-label={t('contribute.title')}>
            <TabsTrigger value="deposit" className="flex-1">{t('contribute.deposit')}</TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1">{t('contribute.withdraw')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {goal && <p className="flex items-baseline gap-2 text-sm text-ink-2">{t('contribute.available')}<AmountText amount={goal.savedAmount} size="md" /></p>}
        <Field label={t('contribute.amount')} error={fieldError} required>
          <MoneyInput autoFocus value={amount} onChange={setAmount} />
        </Field>
        <Field label={t('contribute.note')} optional><Input value={note} maxLength={200} onChange={(ev) => setNote(ev.target.value)} placeholder={t('contribute.notePlaceholder')} /></Field>
        <p className="text-sm text-ink-2">{t('contribute.note2')}</p>
        {apiMsg && <Alert tone="danger">{apiMsg}</Alert>}
      </form>
    </ResponsiveDialog>
  );
}

/** delete / cancel confirmation */
export function ConfirmGoalDialog({ goal, kind, onClose, onConfirm, pending }: { goal: Goal | null; kind: 'delete' | 'cancel'; onClose: () => void; onConfirm: () => void; pending: boolean }) {
  const { t } = useTranslation('goals');
  const { t: tc } = useTranslation();
  return (
    <ResponsiveDialog
      open={!!goal} onOpenChange={(o) => !o && onClose()} title={t(`${kind}.title`, { name: goal?.name ?? '' })} description={t(`${kind}.body`)}
      footer={<><Button size="lg" variant="destructive" loading={pending} onClick={onConfirm}>{t(`${kind}.confirm`)}</Button><Button size="lg" variant="ghost" onClick={onClose}>{kind === 'cancel' ? t('cancel.keep') : tc('common.cancel')}</Button></>}
    >
      <></>
    </ResponsiveDialog>
  );
}

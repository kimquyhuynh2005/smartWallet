import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminPlans, useUpdateAdminPlan } from '@/api';
import { toast } from '@/stores/ui';
import { Alert, Button, Card, CardHeader, CardTitle, Field, Input, ResponsiveDialog, Skeleton, Switch } from '@/ui';
import { mutationMessage, QueryState } from './shared';

type Plan = NonNullable<ReturnType<typeof useAdminPlans>['data']>[number];
type Limits = Plan['limits'];
const KEYS = ['max_wallets', 'max_budgets', 'max_goals', 'history_months'] as const;
type Draft = Record<(typeof KEYS)[number], { unlimited: boolean; text: string }>;

const toDraft = (l: Limits): Draft => Object.fromEntries(KEYS.map((k) => [k, { unlimited: l[k] === null, text: l[k] === null ? '' : String(l[k]) }])) as Draft;
const isValid = (d: Draft[keyof Draft]) => d.unlimited || /^[1-9]\d{0,5}$/.test(d.text.trim());
const toLimits = (d: Draft): Limits => Object.fromEntries(KEYS.map((k) => [k, d[k].unlimited ? null : Number(d[k].text.trim())])) as Limits;

export default function Plans() {
  const { t } = useTranslation('admin');
  const q = useAdminPlans();
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-ink-2">{t('plans.intro')}</p>
      <QueryState q={q} skeleton={<div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>}>
        {(plans) => (
          <div className="grid items-start gap-6 md:grid-cols-2">
            {[...plans].sort((a) => (a.code === 'FREE' ? -1 : 1)).map((p) => <PlanCard key={`${p.code}:${JSON.stringify(p.limits)}`} plan={p} />)}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const { t } = useTranslation('admin');
  const update = useUpdateAdminPlan();
  const initial = useMemo(() => toDraft(plan.limits), [plan.limits]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const valid = KEYS.every((k) => isValid(draft[k]));
  const set = (k: (typeof KEYS)[number], v: Partial<Draft[typeof k]>) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...v } }));

  const save = () => update.mutate({ code: plan.code, limits: toLimits(draft) }, {
    onSuccess: () => { toast.success(t('plans.saved', { plan: t(`plan.${plan.code}`) })); setConfirm(false); },
    onError: (e) => { toast.error(mutationMessage(e, t)); setConfirm(false); },
  });

  return (
    <Card className="min-w-0">
      <CardHeader><div><CardTitle>{t(`plan.${plan.code}`)}</CardTitle><p className="num mt-0.5 text-sm text-ink-2">{t('plans.users', { count: plan.users })}</p></div></CardHeader>
      <form onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid && dirty) setConfirm(true); }} noValidate className="flex flex-col gap-5">
        {KEYS.map((k) => {
          const d = draft[k];
          const err = touched && !isValid(d) ? t('plans.invalid') : undefined;
          return (
            <div key={k} className="flex flex-col gap-2">
              <Field label={t(`plans.${k}`)} hint={t(`plans.${k}_hint`)} error={err}>
                <Input inputMode="numeric" value={d.unlimited ? t('plans.unlimited') : d.text} disabled={d.unlimited} onChange={(e) => set(k, { text: e.target.value.replace(/\D/g, '') })} className="num" />
              </Field>
              <div className="flex items-center gap-3 text-sm text-ink">
                <Switch checked={d.unlimited} onChange={(v) => set(k, { unlimited: v, text: v ? '' : d.text || String(initial[k].text || 1) })} label={`${t(`plans.${k}`)}: ${t('plans.unlimited')}`} />
                <span aria-hidden>{t('plans.unlimited')}</span>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" disabled={!dirty} loading={update.isPending}>{t('save')}</Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => { setDraft(initial); setTouched(false); }}>{t('plans.reset')}</Button>
          {dirty && <span className="text-sm text-warn" role="status">{t('plans.dirty')}</span>}
        </div>
      </form>
      {confirm && (
        <ResponsiveDialog
          open onOpenChange={(o) => { if (!o) setConfirm(false); }} title={t('plans.confirmTitle', { plan: t(`plan.${plan.code}`) })}
          footer={<><Button onClick={save} loading={update.isPending}>{t('plans.confirm')}</Button><Button variant="ghost" onClick={() => setConfirm(false)}>{t('cancel')}</Button></>}
        >
          <p className="text-base text-ink">{t('plans.confirmBody', { count: plan.users })}</p>
          <Alert tone="warning">{t('plans.confirmWarn')}</Alert>
        </ResponsiveDialog>
      )}
    </Card>
  );
}

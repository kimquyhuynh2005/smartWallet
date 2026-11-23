import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogout, useMe } from '@/app/auth';
import { useMutation } from '@tanstack/react-query';
import { endpoints, isApiError } from '@/api';
import { toast } from '@/stores/ui';
import { Button, Field, Input, PasswordInput, ResponsiveDialog, Skeleton } from '@/ui';
import { Section } from './Section';

export function DataSection() {
  const { t } = useTranslation('settings');
  const { i18n } = useTranslation();
  const me = useMe();
  // own mutation with meta.silent: the dialog shows the one message, the global handler stays quiet
  const del = useMutation({ mutationFn: (pw?: string) => endpoints.me.remove(pw), meta: { silent: true } });
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string>();

  if (me.isPending) return <Skeleton className="h-40 w-full" />;
  const email = me.data?.email ?? '';
  const hasPassword = !!me.data?.hasPassword;
  const word = t('data.word');
  const norm = (s: string) => s.trim().toLowerCase();
  const stripped = (s: string) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const typedOk = !!typed.trim() && (norm(typed) === norm(email) || stripped(typed) === stripped(word) || stripped(typed) === 'delete');
  const valid = typedOk && (!hasPassword || password.length > 0);

  const close = (o: boolean) => { if (del.isPending) return; setOpen(o); if (!o) { setTyped(''); setPassword(''); setPwError(undefined); } };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setPwError(undefined);
    del.mutate(hasPassword ? password : undefined, {
      onSuccess: () => logout.mutate(),
      onError: (err) => {
        if (isApiError(err) && (err.status === 400 || err.status === 401 || err.status === 403)) setPwError(t('data.wrongPassword'));
        else toast.error(t('saveFailed'));
      },
    });
  };

  return (
    <>
      <Section title={t('data.title')} description={t('data.intro')}>
        <div><Button variant="destructive" onClick={() => setOpen(true)}>{t('data.button')}</Button></div>
      </Section>
      <ResponsiveDialog
        open={open} onOpenChange={close} title={t('data.dialogTitle')} description={t('data.dialogDesc')}
        footer={<>
          <Button variant="secondary" onClick={() => close(false)} disabled={del.isPending}>{t('data.keep')}</Button>
          <Button variant="destructive" type="submit" form="delete-account-form" disabled={!valid} loading={del.isPending}>{t('data.confirm')}</Button>
        </>}
      >
        <div>
          <p className="text-sm font-medium text-ink">{t('data.willDelete')}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-2">
            {(['data', 'soft', 'billing'] as const).map((k) => <li key={k}>{t(`data.items.${k}`)}</li>)}
          </ul>
        </div>
        <form id="delete-account-form" onSubmit={submit} className="flex flex-col gap-4" noValidate lang={i18n.language}>
          <Field label={t('data.typeLabel', { word })} hint={t('data.typeHint', { email })} error={typed && !typedOk ? t('data.typeInvalid', { word }) : undefined}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          </Field>
          {hasPassword && (
            <Field label={t('data.password')} error={pwError}>
              <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setPwError(undefined); }} autoComplete="current-password" />
            </Field>
          )}
        </form>
      </ResponsiveDialog>
    </>
  );
}

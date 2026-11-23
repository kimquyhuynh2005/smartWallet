import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogout, useMe } from '@/app/auth';
import { isApiError, qk, useChangePassword, useRevokeOtherSessions, useRevokeSession, useSessions } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatDate, type Lang } from '@/lib/format';
import { checkPassword } from '@/lib/password';
import { toast } from '@/stores/ui';
import { Alert, Badge, Button, Field, PasswordInput, PasswordStrength, ResponsiveDialog, Skeleton } from '@/ui';
import { Section } from './Section';

const is404 = (e: unknown) => isApiError(e) && e.status === 404;

function whenOf(iso: string, lang: Lang): string {
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 2) return lang === 'vi' ? 'vừa xong' : 'just now';
  const rtf = new Intl.RelativeTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { numeric: 'auto' });
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return Math.abs(days) < 30 ? rtf.format(days, 'day') : formatDate(iso, lang, 'short');
}

export function SecuritySection() {
  return (
    <div className="flex flex-col gap-6">
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}

function PasswordCard() {
  const { t } = useTranslation('settings');
  const me = useMe();
  const qc = useQueryClient();
  const change = useChangePassword();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [done, setDone] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  if (me.data && !me.data.hasPassword) return <Section title={t('security.passwordTitle')}><Alert>{t('security.noPassword')}</Alert></Section>;

  const errors = {
    cur: !cur ? t('security.currentRequired') : serverError,
    next: !checkPassword(next).valid ? t('security.newInvalid') : next === cur ? t('security.sameAsOld') : undefined,
    again: again !== next ? t('security.mismatch') : undefined,
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true); setDone(false);
    if (errors.cur || errors.next || errors.again) return;
    setServerError(undefined); setUnavailable(false);
    change.mutate({ currentPassword: cur, newPassword: next }, {
      onSuccess: () => { setCur(''); setNext(''); setAgain(''); setTouched(false); setDone(true); toast.success(t('security.done'), t('security.doneHint')); void qc.invalidateQueries({ queryKey: qk.sessions }); },
      onError: (err) => {
        if (isApiError(err) && err.code === 'WRONG_PASSWORD') setServerError(t('security.wrongCurrent'));
        else if (is404(err)) setUnavailable(true);
        else toast.error(t('saveFailed'));
      },
    });
  };

  return (
    <Section title={t('security.passwordTitle')} description={t('security.passwordHint')}>
      <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate>
        <Field label={t('security.current')} error={touched || serverError ? errors.cur : undefined}>
          <PasswordInput value={cur} onChange={(e) => { setCur(e.target.value); setServerError(undefined); }} autoComplete="current-password" />
        </Field>
        <Field label={t('security.new')} error={touched ? errors.next : undefined}>
          <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <PasswordStrength value={next} />
        <Field label={t('security.confirm')} error={touched ? errors.again : undefined}>
          <PasswordInput value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </Field>
        {unavailable && <Alert tone="info">{t('security.unavailable')}</Alert>}
        {done && <Alert tone="success">{t('security.done')}. {t('security.doneHint')}</Alert>}
        <div><Button type="submit" loading={change.isPending}>{t('security.submit')}</Button></div>
      </form>
    </Section>
  );
}

function SessionsCard() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const logout = useLogout();
  const [busyId, setBusyId] = useState<string>();
  const [confirmOthers, setConfirmOthers] = useState(false);

  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current);

  return (
    <Section title={t('security.sessionsTitle')} description={t('security.sessionsHint')}>
      {sessions.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-label={tc('common.loading')}><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : is404(sessions.error) ? (
        <Alert>{t('security.sessionsUnavailable')}</Alert>
      ) : sessions.isError ? (
        <Alert tone="danger"><div className="flex flex-wrap items-center gap-3"><span>{t('security.sessionsFailed')}</span><Button size="sm" variant="secondary" onClick={() => void sessions.refetch()}>{tc('common.retry')}</Button></div></Alert>
      ) : list.length === 0 ? (
        <p className="text-sm text-ink-2">{t('security.noSessions')}</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {list.map((s) => {
              const Icon = /iphone|android|ipad|mobile/i.test(s.device) ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 border-t border-line py-3 first:border-0 first:pt-0">
                  <Icon className="h-5 w-5 shrink-0 text-ink-2" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-base font-medium text-ink"><span className="line-clamp-2 break-words">{s.device}</span>{s.current && <Badge tone="accent">{t('security.thisDevice')}</Badge>}</p>
                    <p className="text-sm text-ink-2">{s.place} · {t('security.lastActive', { when: whenOf(s.lastActiveAt, lang) })}</p>
                  </div>
                  {!s.current && (
                    <Button
                      size="sm" variant="secondary" aria-label={t('security.revokeAria', { device: s.device })} loading={busyId === s.id}
                      onClick={() => { setBusyId(s.id); revoke.mutate(s.id, { onSuccess: () => toast.success(t('security.revoked')), onError: () => toast.error(t('saveFailed')), onSettled: () => setBusyId(undefined) }); }}
                    >{t('security.revoke')}</Button>
                  )}
                </li>
              );
            })}
          </ul>
          {others.length > 0 && (
            <div><Button variant="secondary" onClick={() => setConfirmOthers(true)}>{t('security.revokeOthers')}</Button></div>
          )}
        </>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => logout.mutate()} loading={logout.isPending}><LogOut className="h-4 w-4" aria-hidden />{t('security.logout')}</Button>
        <span className="text-sm text-ink-2">{t('security.logoutHint')}</span>
      </div>
      <ResponsiveDialog
        open={confirmOthers} onOpenChange={(o) => !revokeOthers.isPending && setConfirmOthers(o)} title={t('security.revokeOthers')} description={t('security.revokeOthersDesc')}
        footer={<>
          <Button autoFocus variant="secondary" onClick={() => setConfirmOthers(false)} disabled={revokeOthers.isPending}>{tc('common.cancel')}</Button>
          <Button loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate(undefined, { onSuccess: () => { setConfirmOthers(false); toast.success(t('security.revokedOthers')); }, onError: () => toast.error(t('saveFailed')) })}>{t('security.revokeOthers')}</Button>
        </>}
      ><p className="text-sm text-ink-2">{t('security.revokeOthersDesc')}</p></ResponsiveDialog>
    </Section>
  );
}

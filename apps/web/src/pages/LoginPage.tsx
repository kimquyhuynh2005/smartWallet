import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell, DemoMailLink, FEATURES, GoogleButton, OrDivider } from '@/features/auth/shared';
import { endpoints } from '@/lib/api/endpoints';
import { describeError, isApiError } from '@/lib/api/errors';
import { session } from '@/lib/api/session';
import { USE_MOCKS } from '@/lib/realtime';
import { DEMO } from '@/mocks/demo';
import { Alert, Button, Card, Field, Input, PasswordInput } from '@/ui';
import { emailField } from './auth/schemas';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const [resent, setResent] = useState(false);
  const schema = useMemo(() => z.object({ email: emailField(t), password: z.string().min(1, t('authx.passwordRequired')) }), [t]);
  type Form = z.infer<typeof schema>;
  const { register, handleSubmit, getValues, setValue, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const login = useMutation({
    mutationFn: (v: Form) => endpoints.auth.login(v),
    onSuccess: (r) => { session.set(r.accessToken); navigate((loc.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true }); },
    meta: { silent: true },
  });
  const resend = useMutation({ mutationFn: () => endpoints.auth.resendVerification(getValues('email')), onSuccess: () => setResent(true), meta: { silent: true } });
  const demo = (who: 'linh' | 'minh') => { setValue('email', DEMO[who].email); setValue('password', DEMO[who].password); login.mutate({ email: DEMO[who].email, password: DEMO[who].password }); };

  const code = isApiError(login.error) ? login.error.code : null;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,28rem)] lg:gap-16">
      <section className="hidden max-w-xl flex-col gap-4 pt-10 lg:flex">
        <h2 className="text-3xl font-semibold text-ink">{t('auth.tagline')}</h2>
        <p className="text-base text-ink-2">{t('auth.loginSub')}</p>
      </section>
      <div className="flex flex-col gap-4">
        <AuthShell title={t('auth.loginTitle')} sub={<span className="lg:hidden">{t('auth.loginSub')}</span>}>
          {params.get('expired') && <Alert tone="info">{t('auth.sessionExpired')}</Alert>}
          {params.get('verified') && <Alert tone="success">{t('authx.verify.okTitle')}</Alert>}
          {params.get('reset') && <Alert tone="success">{t('authx.reset.doneTitle')}. {t('authx.reset.doneBody')}</Alert>}
          {code === 'EMAIL_NOT_VERIFIED' && (
            <Alert tone="warning">
              <p>{t('authx.emailNotVerified')}</p>
              {FEATURES.resendVerification && (resent ? <p className="mt-1 font-medium">{t('authx.resent')}</p> : <Button size="sm" variant="secondary" className="mt-2" loading={resend.isPending} onClick={() => resend.mutate()}>{t('authx.resend')}</Button>)}
              {FEATURES.resendVerification && <div className="mt-2"><DemoMailLink email={getValues('email')} kind="verify" to={(tk) => `/verify-email?token=${tk}`} label={t('authx.checkEmail.demo')} /></div>}
            </Alert>
          )}
          {code === 'ACCOUNT_LOCKED' && <Alert tone="danger"><p>{t('authx.locked')}</p><Link to="/forgot-password" className="mt-1 inline-block font-medium underline underline-offset-4">{t('auth.forgot')}</Link></Alert>}
          {login.error && code !== 'EMAIL_NOT_VERIFIED' && code !== 'ACCOUNT_LOCKED' && <Alert tone="danger">{describeError(login.error, t)}</Alert>}

          <GoogleButton />
          <OrDivider />
          <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => login.mutate(v))} noValidate>
            <Field label={t('auth.email')} error={errors.email?.message} required><Input type="email" autoComplete="email" inputMode="email" invalid={!!errors.email} {...register('email')} /></Field>
            <Field label={t('auth.password')} error={errors.password?.message} required><PasswordInput autoComplete="current-password" invalid={!!errors.password} {...register('password')} /></Field>
            <Button type="submit" size="lg" loading={login.isPending}>{t('auth.login')}</Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <Link to="/forgot-password" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('auth.forgot')}</Link>
            <span className="text-ink-2">{t('auth.noAccount')} <Link to="/register" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('auth.register')}</Link></span>
          </div>
        </AuthShell>

        {USE_MOCKS && (
          <Card className="flex max-w-md flex-col gap-3 border-dashed">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><FlaskConical className="h-4 w-4 text-ink-3" aria-hidden />{t('auth.demoTitle')}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={() => demo('linh')}>{t('auth.demoLinh')}</Button>
              <Button variant="secondary" className="flex-1" onClick={() => demo('minh')}>{t('auth.demoMinh')}</Button>
            </div>
            <p className="text-xs text-ink-3">{t('auth.demoHint')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

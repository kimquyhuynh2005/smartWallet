import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell, GoogleButton, OrDivider } from '@/features/auth/shared';
import { endpoints } from '@/lib/api/endpoints';
import { describeError, isApiError } from '@/lib/api/errors';
import { Alert, Button, Field, Input, PasswordInput, PasswordStrength } from '@/ui';
import { emailField, passwordField } from './auth/schemas';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const schema = useMemo(() => z.object({ fullName: z.string().trim().min(1, t('authx.nameRequired')).max(100), email: emailField(t), password: passwordField(t) }), [t]);
  type Form = z.infer<typeof schema>;
  const { register, handleSubmit, watch, formState: { errors, touchedFields } } = useForm<Form>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { fullName: '', email: '', password: '' } });
  const pw = watch('password');

  const signup = useMutation({
    mutationFn: (v: Form) => endpoints.auth.register(v),
    onSuccess: (_r, v) => navigate('/check-email', { state: { email: v.email }, replace: true }),
    meta: { silent: true },
  });
  const taken = isApiError(signup.error) && signup.error.code === 'EMAIL_TAKEN';

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-20">
    <AuthShell title={t('auth.registerTitle')} sub={t('auth.registerSub')}>
      {signup.error && (taken
        ? <Alert tone="warning"><p>{t('authx.emailTaken')}</p><p className="mt-1 flex gap-4 font-medium"><Link to="/login" className="underline underline-offset-4">{t('auth.login')}</Link><Link to="/forgot-password" className="underline underline-offset-4">{t('auth.forgot')}</Link></p></Alert>
        : <Alert tone="danger">{describeError(signup.error, t)}</Alert>)}
      <GoogleButton />
      <OrDivider />
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => signup.mutate(v))} noValidate>
        <Field label={t('auth.fullName')} error={errors.fullName?.message} required><Input autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} /></Field>
        <Field label={t('auth.email')} error={errors.email?.message} required><Input type="email" autoComplete="email" inputMode="email" invalid={!!errors.email || taken} {...register('email')} /></Field>
        <Field label={t('auth.password')} error={touchedFields.password ? errors.password?.message : undefined} required>
          <PasswordInput autoComplete="new-password" invalid={!!errors.password && !!touchedFields.password} aria-describedby="pw-strength" {...register('password')} />
        </Field>
        <PasswordStrength id="pw-strength" value={pw ?? ''} />
        <Button type="submit" size="lg" loading={signup.isPending}>{t('auth.register')}</Button>
        <p className="text-xs text-ink-3">{t('authx.terms')}</p>
      </form>
      <p className="text-sm text-ink-2">{t('auth.haveAccount')} <Link to="/login" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('auth.login')}</Link></p>
    </AuthShell>
      <aside className="hidden max-w-md flex-col gap-4 pt-12 lg:flex">
        <h2 className="text-2xl font-semibold text-ink">{t('auth.tagline')}</h2>
        <ul className="flex flex-col gap-3 border-t border-line pt-5 text-base text-ink">
          {['pitch1', 'pitch2', 'pitch3'].map((k) => <li key={k} className="flex items-start gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />{t(`auth.${k}`)}</li>)}
        </ul>
      </aside>
    </div>
  );
}

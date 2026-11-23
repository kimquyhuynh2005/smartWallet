import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell, DemoMailLink } from '@/features/auth/shared';
import { endpoints } from '@/lib/api/endpoints';
import { describeError } from '@/lib/api/errors';
import { Alert, Button, Field, Input } from '@/ui';
import { emailField } from './auth/schemas';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const schema = useMemo(() => z.object({ email: emailField(t) }), [t]);
  type Form = z.infer<typeof schema>;
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });
  const send = useMutation({ mutationFn: (v: Form) => endpoints.auth.forgotPassword(v.email), meta: { silent: true } });
  return (
    <AuthShell title={send.isSuccess ? t('authx.forgot.sentTitle') : t('authx.forgot.title')} sub={send.isSuccess ? undefined : t('authx.forgot.sub')}>
      {send.isSuccess ? (
        <>
          <div className="flex items-start gap-3 rounded-md bg-accent-soft p-4 text-ink" role="status"><MailCheck className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden /><p>{t('authx.forgot.sentBody', { email: getValues('email') })}</p></div>
          <DemoMailLink email={getValues('email')} kind="reset" to={(tk) => `/reset-password?token=${tk}`} label={t('authx.checkEmail.demo')} />
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => send.mutate(v))} noValidate>
          {send.error && <Alert tone="danger">{describeError(send.error, t)}</Alert>}
          <Field label={t('auth.email')} error={errors.email?.message} required><Input type="email" autoComplete="email" inputMode="email" invalid={!!errors.email} {...register('email')} /></Field>
          <Button type="submit" size="lg" loading={send.isPending}>{t('authx.forgot.send')}</Button>
        </form>
      )}
      <Link to="/login" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('auth.login')}</Link>
    </AuthShell>
  );
}

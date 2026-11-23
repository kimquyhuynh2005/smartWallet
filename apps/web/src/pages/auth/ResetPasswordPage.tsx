import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell } from '@/features/auth/shared';
import { endpoints } from '@/lib/api/endpoints';
import { describeError, isApiError } from '@/lib/api/errors';
import { Alert, Button, Field, PasswordInput, PasswordStrength } from '@/ui';
import { passwordField } from './schemas';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token');
  const schema = useMemo(() => z.object({ password: passwordField(t), confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('authx.mismatch') }), [t]);
  type Form = z.infer<typeof schema>;
  const { register, handleSubmit, watch, formState: { errors, touchedFields } } = useForm<Form>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { password: '', confirm: '' } });
  const reset = useMutation({
    mutationFn: (v: Form) => endpoints.auth.resetPassword(token!, v.password),
    onSuccess: () => navigate('/login?reset=1', { replace: true }),
    meta: { silent: true },
  });
  const badLink = !token || (isApiError(reset.error) && ['INVALID_TOKEN', 'TOKEN_EXPIRED'].includes(reset.error.code));

  if (badLink) return (
    <AuthShell title={t('authx.reset.invalidTitle')}>
      <p className="flex items-start gap-3 text-ink-2" role="alert"><CircleAlert className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden />{t('authx.reset.invalidBody')}</p>
      <Link to="/forgot-password"><Button size="lg" className="w-full">{t('authx.reset.newLink')}</Button></Link>
    </AuthShell>
  );
  return (
    <AuthShell title={t('authx.reset.title')} sub={t('authx.reset.sub')}>
      {reset.error && <Alert tone="danger">{describeError(reset.error, t)}</Alert>}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => reset.mutate(v))} noValidate>
        <Field label={t('authx.reset.newPassword')} error={touchedFields.password ? errors.password?.message : undefined} required><PasswordInput autoComplete="new-password" invalid={!!errors.password && !!touchedFields.password} aria-describedby="pw-strength" {...register('password')} /></Field>
        <PasswordStrength id="pw-strength" value={watch('password') ?? ''} />
        <Field label={t('authx.confirmPassword')} error={errors.confirm?.message} required><PasswordInput autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} /></Field>
        <Button type="submit" size="lg" loading={reset.isPending}>{t('authx.reset.submit')}</Button>
      </form>
    </AuthShell>
  );
}

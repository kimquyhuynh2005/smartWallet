import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthShell, DemoMailLink, FEATURES } from '@/features/auth/shared';
import { endpoints } from '@/lib/api/endpoints';
import { describeError } from '@/lib/api/errors';
import { Alert, Button } from '@/ui';

export default function CheckEmailPage() {
  const { t } = useTranslation();
  const email = (useLocation().state as { email?: string } | null)?.email;
  const [sent, setSent] = useState(false);
  const resend = useMutation({ mutationFn: () => endpoints.auth.resendVerification(email!), onSuccess: () => setSent(true), meta: { silent: true } });
  if (!email) return <Navigate to="/register" replace />;
  return (
    <AuthShell title={t('authx.checkEmail.title')}>
      <div className="flex items-start gap-3 rounded-md bg-accent-soft p-4 text-ink">
        <MailCheck className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 break-words text-base" role="status">{t('authx.checkEmail.body', { email })}</p>
      </div>
      <p className="text-sm text-ink-2">{t('authx.checkEmail.tip')}</p>
      {sent && <Alert tone="success">{t('authx.resent')}</Alert>}
      {resend.error && <Alert tone="danger">{describeError(resend.error, t)}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {FEATURES.resendVerification && <Button variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>{t('authx.resend')}</Button>}
        <DemoMailLink email={email} kind="verify" to={(tk) => `/verify-email?token=${tk}`} label={t('authx.checkEmail.demo')} />
      </div>
      <div className="flex flex-wrap gap-x-5 text-sm font-medium">
        <Link to="/register" className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline">{t('authx.checkEmail.other')}</Link>
        <Link to="/login" className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline">{t('authx.checkEmail.toLogin')}</Link>
      </div>
    </AuthShell>
  );
}

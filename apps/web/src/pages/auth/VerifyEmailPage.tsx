import { useMutation } from '@tanstack/react-query';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/features/auth/shared';
import { endpoints } from '@/lib/api/endpoints';
import { Button, Skeleton, Spinner } from '@/ui';

/** AUTH-01: the emailed link lands here with ?token=... and is used exactly once (the ref guards React StrictMode's double effect). */
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const token = useSearchParams()[0].get('token');
  const started = useRef(false);
  const verify = useMutation({ mutationFn: (tk: string) => endpoints.auth.verifyEmail(tk), meta: { silent: true } });
  useEffect(() => {
    if (token && !started.current) { started.current = true; verify.mutate(token); }
  }, [token, verify]);

  if (!token) return <AuthShell title={t('authx.verify.failTitle')}><p className="text-ink-2">{t('authx.verify.missing')}</p><Link to="/login" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('auth.login')}</Link></AuthShell>;
  if (verify.isSuccess) return (
    <AuthShell title={t('authx.verify.okTitle')}>
      <p className="flex items-start gap-3 text-ink-2" role="status"><CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden />{t('authx.verify.okBody')}</p>
      <Link to="/login?verified=1"><Button size="lg" className="w-full">{t('auth.login')}</Button></Link>
    </AuthShell>
  );
  if (verify.isError) return (
    <AuthShell title={t('authx.verify.failTitle')}>
      <p className="flex items-start gap-3 text-ink-2" role="alert"><CircleAlert className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden />{t('authx.verify.failBody')}</p>
      <Link to="/login"><Button size="lg" variant="secondary" className="w-full">{t('auth.login')}</Button></Link>
    </AuthShell>
  );
  return (
    <AuthShell title={t('authx.verify.loading')}>
      <div className="flex items-center gap-3 text-ink-2" role="status"><Spinner className="h-5 w-5" />{t('common.loading')}</div>
      <Skeleton className="h-11" />
    </AuthShell>
  );
}

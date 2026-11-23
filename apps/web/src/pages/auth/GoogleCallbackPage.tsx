import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/features/auth/shared';
import { refreshAccessToken } from '@/lib/api/client';
import { Alert, Skeleton } from '@/ui';

/** AUTH-03: the API sets the refresh cookie and redirects here; trade it for an access token and carry on. */
export default function GoogleCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void refreshAccessToken().then((tk) => (tk ? navigate('/dashboard', { replace: true }) : setFailed(true)));
  }, [navigate]);
  return (
    <AuthShell title={t('authx.callback.loading')}>
      {failed ? <><Alert tone="danger">{t('authx.callback.failed')}</Alert><Link to="/login" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('auth.login')}</Link></> : <Skeleton className="h-11" />}
    </AuthShell>
  );
}

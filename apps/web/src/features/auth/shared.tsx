import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '@/lib/api/client';
import { USE_MOCKS } from '@/lib/realtime';
import { Alert, Button, Card } from '@/ui';

/** Single-column card used by every auth screen: left-aligned, no centred hero. */
export function AuthShell({ title, sub, children, wide }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'max-w-xl pt-2 lg:pt-10' : 'max-w-md pt-2 lg:pt-10'}>
      <Card className="flex flex-col gap-5 p-5 md:p-6">
        <div>
          <h1 className="text-xl font-semibold text-ink md:text-2xl">{title}</h1>
          {sub && <p className="mt-1 text-sm text-ink-2 md:text-base">{sub}</p>}
        </div>
        {children}
      </Card>
    </div>
  );
}

export const FEATURES = {
  /** the real API has no resend endpoint yet (docs/backend-requests.md #7) */
  resendVerification: USE_MOCKS,
};

const G = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z" />
  </svg>
);

/** AUTH-03. The API answers 501 when Google is not configured: say so instead of showing the browser a JSON error page. */
export function GoogleButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  async function go() {
    setBusy(true); setOff(false);
    try {
      const res = USE_MOCKS ? { status: 501 } : await fetch(`${API_URL}/auth/google`, { redirect: 'manual' });
      if (res.status === 501) { setOff(true); return; }
      window.location.href = `${API_URL}/auth/google`; // hands over to Google; the callback lands on /auth/callback
    } catch { window.location.href = `${API_URL}/auth/google`; } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="lg" loading={busy} onClick={() => void go()}>{G}{t('authx.google')}</Button>
      {off && <Alert tone="info">{t('authx.googleOff')}</Alert>}
    </div>
  );
}

export function OrDivider() {
  const { t } = useTranslation();
  return <div className="flex items-center gap-3 text-sm text-ink-3" role="separator"><span className="h-px flex-1 bg-line" /><span>{t('authx.or')}</span><span className="h-px flex-1 bg-line" /></div>;
}

/** demo mode only: the mock mailer has no inbox, so offer the link it "sent" */
export function DemoMailLink({ email, kind, to, label }: { email: string; kind: 'verify' | 'reset'; to: (token: string) => string; label: string }) {
  const navigate = useNavigate();
  if (!USE_MOCKS) return null;
  return (
    <Button variant="secondary" onClick={async () => {
      const { mockControls } = await import('@/mocks/browser');
      const token = mockControls.lastMailToken(email, kind);
      if (token) navigate(to(token));
    }}>{label}</Button>
  );
}

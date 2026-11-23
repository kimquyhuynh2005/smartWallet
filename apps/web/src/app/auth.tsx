import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ShieldAlert, WifiOff } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiEvents, refreshAccessToken } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { session, useAccessToken } from '@/lib/api/session';
import { qk } from '@/lib/queryKeys';
import { useUi } from '@/stores/ui';
import { Button, EmptyState, Skeleton } from '@/ui';

type Boot = 'loading' | 'ready' | 'unreachable';
const BootContext = createContext<{ boot: Boot; retry: () => void }>({ boot: 'loading', retry: () => undefined });

/**
 * The access token is memory-only, so after a reload there is none: ask the httpOnly refresh cookie for one ONCE, then render.
 * Also listens for `session-expired` (a refresh failed mid-session) and sends the user to /login.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>(session.get() ? 'ready' : 'loading');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const start = () => {
    setBoot('loading');
    // a network failure is NOT "signed out": say so and let the user (or the browser coming back online) retry
    refreshAccessToken().then(() => setBoot('ready'), () => setBoot('unreachable'));
  };
  useEffect(() => {
    if (session.get()) return;
    // start downloading the landing screen of a returning user while the cookie is exchanged for a token
    if (window.location.pathname === '/dashboard') void import('@/features/dashboard/page');
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(
    () => apiEvents.on('session-expired', () => {
      session.clear();
      qc.clear();
      useUi.getState().closeQuickAdd();
      navigate('/login?expired=1', { replace: true });
    }),
    [qc, navigate],
  );
  useEffect(() => apiEvents.on('offline', () => useUi.getState().setOffline(true)), []);
  // the browser knows before any request fails: show the banner at once and refetch when the connection returns
  useEffect(() => {
    const off = () => useUi.getState().setOffline(true);
    const on = () => { useUi.getState().setOffline(false); void qc.invalidateQueries(); setBoot((b) => { if (b === 'unreachable') start(); return b; }); };
    if (typeof navigator !== 'undefined' && !navigator.onLine) off();
    window.addEventListener('offline', off); window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, [qc]);
  useEffect(() => apiEvents.on('online', () => useUi.getState().setOffline(false)), []);
  return <BootContext.Provider value={{ boot, retry: start }}>{children}</BootContext.Provider>;
}

export const useBoot = () => useContext(BootContext).boot;
const useBootRetry = () => useContext(BootContext).retry;

export function useMe() {
  const token = useAccessToken();
  return useQuery({ queryKey: qk.me, queryFn: endpoints.me.get, enabled: !!token, staleTime: 60_000 });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => endpoints.auth.logout().catch(() => undefined),
    onSettled: () => { session.clear(); qc.clear(); navigate('/login', { replace: true }); },
  });
}

function Splash() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-dvh max-w-page flex-col gap-4 p-6" role="status" aria-label={t('common.loading')}>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <main id="main" className="mx-auto max-w-xl p-6 pt-16">
      <h1 className="sr-only">{t('errors.network')}</h1>
      <EmptyState icon={WifiOff} title={t('errors.unreachableTitle')} action={<Button onClick={onRetry}>{t('common.retry')}</Button>}>{t('errors.network')}</EmptyState>
    </main>
  );
}

/** Authenticated routes. */
export function RequireAuth() {
  const boot = useBoot();
  const retry = useBootRetry();
  const token = useAccessToken();
  const loc = useLocation();
  if (boot === 'loading') return <Splash />;
  if (boot === 'unreachable' && !token) return <Unreachable onRetry={retry} />;
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

/** App routes need a finished onboarding (USER-02): a user with no wallet yet is sent to the wizard first. */
export function RequireOnboarded() {
  const me = useMe();
  if (me.isLoading || !me.data) return <Splash />;
  if (!me.data.onboarded) return <Navigate to={me.data.role === 'ADMIN' ? '/admin' : '/onboarding'} replace />;
  return <Outlet />;
}

/** Login/register pages: signed-in users go to the app. */
export function PublicOnly() {
  const boot = useBoot();
  const token = useAccessToken();
  if (boot === 'loading') return <Splash />;
  return token ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

/** Role-gated routes (admin). The API enforces the role too; this just avoids showing a page that would only 403. */
export function RequireRole({ role }: { role: 'ADMIN' | 'USER' }) {
  const { t } = useTranslation();
  const me = useMe();
  if (me.isLoading) return <Splash />;
  if (me.data?.role !== role) {
    return (
      <div className="mx-auto max-w-xl p-6 pt-16" role="alert">
        <EmptyState icon={ShieldAlert} title={t('errors.forbidden')} action={<Link to="/dashboard" className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline">{t('nav.home')}</Link>}>{t('errors.forbiddenHint')}</EmptyState>
      </div>
    );
  }
  return <Outlet />;
}

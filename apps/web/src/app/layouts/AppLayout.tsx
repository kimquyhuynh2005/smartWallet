import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRealtime } from '@/hooks/useRealtime';
import { Skeleton, OfflineBanner } from '@/ui';
import { AvatarMenu } from '../shell/AvatarMenu';
import { useShortcuts, useTabScroll } from '../shell/hooks';
import { MobileNav } from '../shell/MobileNav';
import { MonthSwitcher } from '../shell/MonthSwitcher';
import { showsPeriod } from '../shell/nav';
import { Sidebar } from '../shell/Sidebar';
import { NotificationBellSlot, QuickAddSlot } from '../shell/Slots';
import { Logo } from './Logo';

const pageFallback = <div className="flex flex-col gap-4 py-2" role="status"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;

/**
 * The authenticated shell. Owned by the lead: feature folders only supply pages (router) and the two slot components.
 *   desktop: sidebar + top bar (month switcher, bell slot, avatar menu)   mobile: top bar + bottom navigation with the raised add button
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  useRealtime();
  useShortcuts();
  useTabScroll();
  const period = showsPeriod(pathname);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float">{t('common.skipToContent')}</a>
      <Sidebar />

      <div className="flex min-w-0 flex-col">
        <OfflineBanner />
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-paper/90 px-2 backdrop-blur md:px-5 lg:h-16 lg:px-8">
          <div className="flex min-w-0 items-center">
            {period ? <MonthSwitcher /> : <Logo to="/dashboard" className="ml-2 lg:hidden" />}
          </div>
          <div className="flex items-center gap-1"><NotificationBellSlot /><AvatarMenu /></div>
        </header>
        {/* a short rise-in on every route change; the key remounts the wrapper (reduced motion: instant) */}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-page px-4 pb-32 pt-5 outline-none md:px-6 lg:px-8 lg:pb-12 lg:pt-6">
          <div key={pathname} className="animate-rise-in motion-reduce:animate-none"><Suspense fallback={pageFallback}><Outlet /></Suspense></div>
        </main>
      </div>

      <MobileNav />
      <QuickAddSlot />
    </div>
  );
}

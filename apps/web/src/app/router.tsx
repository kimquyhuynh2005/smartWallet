import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { Skeleton } from '@/ui';
import { PublicOnly, RequireAuth, RequireOnboarded, RequireRole, SessionProvider } from './auth';
import { Providers } from './Providers';
import RouteError from './RouteError';
import AdminLayout from './layouts/AdminLayout';
import AppLayout from './layouts/AppLayout';
import PublicLayout from './layouts/PublicLayout';
import { Outlet } from 'react-router-dom';

// every screen is its own chunk: the first paint only loads the shell
const L = {
  // marketing + auth + first run (shell-owned, src/pages)
  Landing: lazy(() => import('@/pages/LandingPage')), Login: lazy(() => import('@/pages/LoginPage')), Register: lazy(() => import('@/pages/RegisterPage')), Forgot: lazy(() => import('@/pages/ForgotPasswordPage')),
  CheckEmail: lazy(() => import('@/pages/auth/CheckEmailPage')), Verify: lazy(() => import('@/pages/auth/VerifyEmailPage')), Reset: lazy(() => import('@/pages/auth/ResetPasswordPage')), GoogleCb: lazy(() => import('@/pages/auth/GoogleCallbackPage')),
  About: lazy(() => import('@/features/about/page')), Onboarding: lazy(() => import('@/pages/OnboardingPage')), NotFound: lazy(() => import('@/pages/NotFoundPage')),
  // Features with sub-screens own everything under their prefix: path 'x/*' + <Routes> inside the feature page (wallets/:id, budgets/:categoryId, ...).
// one lazy page per feature folder: src/features/<name>/page.tsx (default export). Feature agents replace those files, never this list.
  Dashboard: lazy(() => import('@/features/dashboard/page')), Transactions: lazy(() => import('@/features/transactions/page')), Wallets: lazy(() => import('@/features/wallets/page')),
  Categories: lazy(() => import('@/features/categories/page')), Budgets: lazy(() => import('@/features/budgets/page')), Goals: lazy(() => import('@/features/goals/page')),
  Reports: lazy(() => import('@/features/reports/page')), Settings: lazy(() => import('@/features/settings/page')), Plans: lazy(() => import('@/features/plans/page')),
  Notifications: lazy(() => import('@/features/notifications/page')), Admin: lazy(() => import('@/features/admin/page')),
};

// /dev/ui exists only in dev and mock builds: the condition is a compile-time constant, so production builds drop the import and its chunk
const DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === 'true';
const UiKit = DEV_TOOLS ? lazy(() => import('@/pages/dev/UiKit')) : null;

const fallback = <div className="flex flex-col gap-4 py-4" role="status"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;
const s = (el: JSX.Element) => <Suspense fallback={fallback}>{el}</Suspense>;

/** Root: providers that need the router (session watcher navigates on expiry) */
function Root() {
  return <Providers><SessionProvider><Outlet /></SessionProvider></Providers>;
}

const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      // marketing home (signed-in users are redirected to /dashboard inside the page)
      { path: '/', element: s(<L.Landing />) },
      // auth: signed-in users are sent to the app
      { element: <PublicOnly />, children: [{ element: <PublicLayout />, children: [
        { path: '/login', element: s(<L.Login />) }, { path: '/register', element: s(<L.Register />) }, { path: '/forgot-password', element: s(<L.Forgot />) },
      ] }] },
      // links from emails and the Google redirect work whether or not a session exists
      { element: <PublicLayout />, children: [
        { path: '/about', element: s(<L.About />) }, { path: '/check-email', element: s(<L.CheckEmail />) }, { path: '/verify-email', element: s(<L.Verify />) }, { path: '/reset-password', element: s(<L.Reset />) }, { path: '/auth/callback', element: s(<L.GoogleCb />) },
      ] },
      { element: <RequireAuth />, children: [
        // first-run wizard (USER-02): its own shell, no app navigation
        { path: '/onboarding', element: s(<L.Onboarding />) },
        // the app proper: needs a finished onboarding
        { element: <RequireOnboarded />, children: [{ element: <AppLayout />, children: [
          { path: 'dashboard', element: s(<L.Dashboard />) }, { path: 'transactions/*', element: s(<L.Transactions />) }, { path: 'wallets/*', element: s(<L.Wallets />) },
          { path: 'categories/*', element: s(<L.Categories />) }, { path: 'budgets/*', element: s(<L.Budgets />) }, { path: 'goals/*', element: s(<L.Goals />) },
          { path: 'reports/*', element: s(<L.Reports />) }, { path: 'settings/*', element: s(<L.Settings />) }, { path: 'plans/*', element: s(<L.Plans />) },
          { path: 'notifications', element: s(<L.Notifications />) },
        ] }] },
        // admin: needs the ADMIN role
        { element: <RequireRole role="ADMIN" />, children: [{ element: <AdminLayout />, children: [{ path: 'admin/*', element: s(<L.Admin />) }] }] },
      ] },
      // design system showcase: only in dev / mock builds
      ...(UiKit
        ? [{ element: <PublicLayout />, children: [{ path: '/dev/ui', element: s(<UiKit />) }] } satisfies RouteObject]
        : []),
      { path: '/home', element: <Navigate to="/dashboard" replace /> },
      { path: '*', element: s(<L.NotFound />) },
    ],
  },
];

const router = createBrowserRouter(routes);
export const AppRouter = () => <RouterProvider router={router} />;

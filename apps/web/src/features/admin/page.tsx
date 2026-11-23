import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { PageHeader } from '@/features/common/parts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/ui';

const Overview = lazy(() => import('./Overview'));
const Users = lazy(() => import('./Users'));
const Categories = lazy(() => import('./Categories'));
const Keywords = lazy(() => import('./Keywords'));
const Plans = lazy(() => import('./Plans'));

const TABS = [
  { to: '/admin', key: 'overview', end: true },
  { to: '/admin/users', key: 'users', end: false },
  { to: '/admin/categories', key: 'categories', end: false },
  { to: '/admin/keywords', key: 'keywords', end: false },
  { to: '/admin/plans', key: 'plans', end: false },
] as const;

/** ADM-01 console. Admins never see individual transactions: no screen here reads or links them. */
export default function AdminHome() {
  const { t } = useTranslation('admin');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="relative -mx-4 mb-6 md:mx-0">
      <nav aria-label={t('navLabel')} className="scroll-hide flex gap-5 overflow-x-auto border-b border-line px-4 md:px-0">
        {TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.end} className={({ isActive }) => cn('-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 pb-1 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', isActive ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink')}>
            {t(`tabs.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-paper to-transparent md:hidden" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper to-transparent md:hidden" />
      </div>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="categories" element={<Categories />} />
          <Route path="keywords" element={<Keywords />} />
          <Route path="plans" element={<Plans />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

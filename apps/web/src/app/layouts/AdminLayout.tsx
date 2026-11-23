import { ArrowLeft } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OfflineBanner } from '@/ui';
import { AvatarMenu } from '../shell/AvatarMenu';
import { Logo } from './Logo';

/** Admin console shell: deliberately plainer than the app (it is a tool, not a daily companion). */
export default function AdminLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-page items-center justify-between gap-3 px-4 py-3 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><Logo to="/admin" /><span className="hidden whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink-2 min-[420px]:inline">{t('nav.admin')}</span></div>
          <AvatarMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-page flex-1 px-4 py-6 md:px-6 lg:px-8">
        <Link to="/dashboard" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />{t('common.back')}</Link>
        <Outlet />
      </main>
    </div>
  );
}

import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle, OfflineBanner, ThemeToggle } from '@/ui';
import { Logo } from './Logo';

export default function PublicLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float">{t('common.skipToContent')}</a>
      <OfflineBanner />
      <header className="mx-auto flex w-full max-w-page items-center justify-between gap-3 px-4 py-4 md:px-6 lg:px-8">
        <Logo />
        <div className="flex items-center gap-2"><ThemeToggle compact /><LanguageToggle compact /></div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-page flex-1 px-4 pb-12 pt-2 md:px-6 lg:px-8"><Outlet /></main>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/app/layouts/Logo';
import { Button, LanguageToggle, ThemeToggle } from '@/ui';

export function LandingHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-page items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
        <Logo />
        <nav aria-label={t('landing.nav.main')} className="hidden items-center gap-1 lg:flex">
          {(['how', 'pricing', 'faq'] as const).map((k) => <a key={k} href={`#${k}`} className="inline-flex min-h-11 items-center rounded-md px-3 text-base font-medium text-ink-2 hover:text-ink">{t(`landing.nav.${k}`)}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden lg:block"><ThemeToggle compact /></span>
          <LanguageToggle compact />
          <Link to="/login" className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-base font-medium text-ink hover:text-accent md:px-3">{t('landing.nav.login')}</Link>
          <Link to="/register" className="hidden sm:block"><Button>{t('landing.nav.start')}</Button></Link>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  const { t } = useTranslation();
  const link = 'inline-flex min-h-11 items-center text-base text-ink-2 hover:text-ink';
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid w-full max-w-page gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr] md:px-6 lg:px-8">
        <div className="flex max-w-xs flex-col gap-3"><Logo /><p className="text-sm text-ink-2">{t('landing.footer.tagline')}</p></div>
        <nav aria-label={t('landing.footer.product')} className="flex flex-col"><p className="eyebrow mb-1">{t('landing.footer.product')}</p>
          {(['how', 'pricing', 'faq'] as const).map((k) => <a key={k} href={`#${k}`} className={link}>{t(`landing.nav.${k}`)}</a>)}
          <Link to="/about" className={link}>{t('landing.footer.about')}</Link>
        </nav>
        <nav aria-label={t('landing.footer.account')} className="flex flex-col"><p className="eyebrow mb-1">{t('landing.footer.account')}</p>
          <Link to="/login" className={link}>{t('landing.nav.login')}</Link><Link to="/register" className={link}>{t('auth.register')}</Link>
        </nav>
        <div className="flex flex-col gap-3"><p className="eyebrow">{t('landing.footer.appearance')}</p><div className="flex flex-wrap items-center gap-2"><ThemeToggle compact /><LanguageToggle compact /></div></div>
      </div>
      <p className="mx-auto w-full max-w-page px-4 pb-8 text-sm text-ink-3 md:px-6 lg:px-8">{t('landing.footer.rights')}</p>
    </footer>
  );
}

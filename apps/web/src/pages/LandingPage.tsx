import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBoot } from '@/app/auth';
import { useAccessToken } from '@/lib/api/session';
import { Button } from '@/ui';
import { LandingFooter, LandingHeader } from './landing/Header';
import { LivePreview } from './landing/LivePreview';
import { Reveal } from './landing/Reveal';
import { Faq, FinalCta, HowItWorks, Pricing, Voices } from './landing/Sections';
import { Story } from './landing/Story';

/** Public home. Signed-in users never see it: they go straight to their dashboard. */
export default function LandingPage() {
  const { t } = useTranslation();
  const boot = useBoot();
  const token = useAccessToken();
  useEffect(() => { document.title = `SmartWallet · ${t('landing.hero.title')}`; }, [t]);
  if (boot === 'ready' && token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-dvh">
      <LandingHeader />
      <main className="mx-auto w-full max-w-page px-4 md:px-6 lg:px-8">
        {/* hero: asymmetric, left-aligned copy; the product itself on the right, running */}
        <section aria-labelledby="hero-title" className="grid grid-cols-[minmax(0,1fr)] items-center gap-14 pb-16 pt-10 md:pt-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-10 lg:pb-16 lg:pt-16">
          <div className="flex flex-col items-start gap-6">
            <p className="eyebrow">{t('landing.hero.eyebrow')}</p>
            <h1 id="hero-title" className="max-w-[16ch] text-[34px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[44px] lg:text-[56px]">{t('landing.hero.title')}</h1>
            <p className="max-w-xl text-base text-ink-2 md:text-lg">{t('landing.hero.sub')}</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link to="/register" className="w-full sm:w-auto"><Button size="lg" className="w-full sm:w-auto">{t('landing.hero.cta')}<ArrowRight className="h-4 w-4" aria-hidden /></Button></Link>
              <a href="#how" className="w-full sm:w-auto"><Button size="lg" variant="secondary" className="w-full sm:w-auto">{t('landing.hero.cta2')}</Button></a>
            </div>
            <p className="text-sm text-ink-3">{t('landing.hero.note')}</p>
          </div>
          <Reveal className="lg:pb-10 lg:pl-6"><LivePreview /></Reveal>
        </section>

        <Story />
        <HowItWorks />
        <Voices />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}

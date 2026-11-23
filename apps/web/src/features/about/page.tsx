import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { Avatar, buttonVariants } from '@/ui';
import { TEAM } from './team';

const REASONS = ['one', 'two', 'three'] as const;
const PROMISES = ['admins', 'yours', 'delete', 'noSale'] as const;

const SECTION = 'mt-12 grid gap-6 border-t border-line pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12 [&>div:first-child]:lg:sticky [&>div:first-child]:lg:top-24 [&>div:first-child]:lg:self-start [&>h2]:lg:sticky [&>h2]:lg:top-24 [&>h2]:lg:self-start';

function Heading({ id, children }: { id: string; children: string }) {
  return <h2 id={id} className="text-xl font-semibold text-ink">{children}</h2>;
}

export default function AboutPage() {
  const { t, i18n } = useTranslation('about');
  useEffect(() => { document.title = t('docTitle'); }, [t, i18n.language]);

  return (
    <div className="mx-auto w-full max-w-page px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <header className="max-w-2xl">
        <p className="eyebrow">{t('overline')}</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink md:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-base text-ink-2">{t('mission.body')}</p>
      </header>

      <section aria-labelledby="why" className={SECTION}>
        <Heading id="why">{t('why.title')}</Heading>
        <ol className="divide-y divide-line border-y border-line">
          {REASONS.map((k, i) => (
            <li key={k} className="grid grid-cols-[1.75rem_1fr] gap-2 py-4 md:grid-cols-[2.5rem_1fr] md:gap-3">
              <span className="num pt-0.5 text-sm font-semibold text-accent">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="text-lg font-semibold text-ink">{t(`why.items.${k}.title`)}</h3>
                <p className="mt-1 text-sm text-ink-2">{t(`why.items.${k}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="team" className={SECTION}>
        <div>
          <Heading id="team">{t('team.title')}</Heading>
          <p className="mt-2 text-sm text-ink-2">{t('team.hint')}</p>
        </div>
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {TEAM.map((m) => (
            <li key={m.role} className="flex items-center gap-3 border-b border-line py-3">
              <Avatar name={m.name} size="lg" decorative />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{m.name}</p>
                <p className="text-sm text-ink-2">{t(`team.roles.${m.role}`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy" className={SECTION}>
        <div>
          <Heading id="privacy">{t('privacy.title')}</Heading>
          <p className="mt-2 text-sm text-ink-2">{t('privacy.lead')}</p>
        </div>
        <ul className="space-y-3">
          {PROMISES.map((k) => (
            <li key={k} className="flex gap-3">
              <Lock className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <p className="text-base">
                <span className="font-medium text-ink">{t(`privacy.items.${k}.title`)}</span>{' '}
                <span className="text-ink-2">{t(`privacy.items.${k}.body`)}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cta" className="mt-12 border-t border-line pt-8">
        <Heading id="cta">{t('cta.title')}</Heading>
        <p className="mt-1 max-w-xl text-sm text-ink-2">{t('cta.body')}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link to="/register" className={buttonVariants({ size: 'lg' })}>{t('cta.action')}</Link>
          <Link to="/login" className={buttonVariants({ size: 'lg', variant: 'secondary' })}>{t('cta.login')}</Link>
        </div>
      </section>
    </div>
  );
}

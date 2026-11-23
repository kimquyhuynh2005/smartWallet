import { ChevronDown, Check, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';
import { formatMoney } from '@/lib/format';
import { Avatar, Button, Card } from '@/ui';
import { Reveal, SectionHead } from './Reveal';

/** Product-owner decision still open (docs/backend-requests.md): the price is a placeholder for the pricing page only. */
export const PREMIUM_PRICE_VND = 49_000;

/* ---------- how it works: numbered path, not cards ---------- */
export function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-t border-line py-16 md:py-24">
      <Reveal><SectionHead id="how-title" eyebrow={t('landing.how.eyebrow')} title={t('landing.how.title')} /></Reveal>
      <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
        {(['s1', 's2', 's3'] as const).map((k, i) => (
          <li key={k}>
            <Reveal delay={i * 100} className="relative flex gap-5 md:block">
              <span className="num select-none text-5xl font-semibold leading-none text-accent md:block md:text-6xl" aria-hidden>{`0${i + 1}`}</span>
              <div className="md:mt-5">
                <div className="mb-3 hidden h-px bg-line-strong md:block" aria-hidden />
                <h3 className="text-lg font-semibold text-ink"><span className="sr-only">{i + 1}. </span>{t(`landing.how.${k}.title`)}</h3>
                <p className="mt-1.5 text-base text-ink-2">{t(`landing.how.${k}.body`)}</p>
                <p className="mt-2 text-sm font-medium text-accent">{t(`landing.how.${k}.time`)}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- voices: one large, two small (not a card grid) ---------- */
export function Voices() {
  const { t } = useTranslation();
  const people = ['linh', 'minh', 'thao'] as const;
  const person = (k: (typeof people)[number], big?: boolean) => (
    <figure className={big ? 'flex flex-col gap-6' : 'flex flex-col gap-4'}>
      <blockquote className={big ? 'text-xl font-medium leading-snug tracking-tight text-ink md:text-2xl' : 'text-base text-ink'} lang="vi">
        <span aria-hidden className="mr-1 text-accent">“</span>{t(`landing.voices.${k}.quote`)}<span aria-hidden className="ml-0.5 text-accent">”</span>
      </blockquote>
      <figcaption className="flex items-center gap-3">
        <Avatar name={t(`landing.voices.${k}.name`)} size={big ? 'lg' : 'md'} />
        <span><span className="block text-base font-semibold text-ink">{t(`landing.voices.${k}.name`)}</span><span className="block text-sm text-ink-2">{t(`landing.voices.${k}.role`)}</span></span>
      </figcaption>
    </figure>
  );
  return (
    <section aria-labelledby="voices-title" className="border-t border-line py-16 md:py-24">
      <Reveal><SectionHead id="voices-title" eyebrow={t('landing.voices.eyebrow')} title={t('landing.voices.title')} /></Reveal>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <Reveal>{person('linh', true)}</Reveal>
        <div className="flex flex-col gap-8 lg:border-l lg:border-line lg:pl-12">
          <Reveal delay={100}>{person('minh')}</Reveal>
          <div className="h-px bg-line" aria-hidden />
          <Reveal delay={200}>{person('thao')}</Reveal>
        </div>
      </div>
      <p className="mt-10 text-sm text-ink-3">{t('landing.voices.caption')}</p>
    </section>
  );
}

/* ---------- pricing ---------- */
const ROWS = ['wallets', 'budgets', 'goals', 'history', 'csv', 'advanced', 'thresholds'] as const;
const FREE_VALUE: Record<(typeof ROWS)[number], string | boolean> = { wallets: '3', budgets: '5', goals: '2', history: 'months', csv: false, advanced: false, thresholds: false };

function Cell({ v, premium }: { v: string | boolean; premium?: boolean }) {
  const { t } = useTranslation();
  if (v === true) return <span className="inline-flex items-center gap-1.5 font-medium text-accent"><Check className="h-4 w-4" aria-hidden />{t('landing.pricing.yes')}</span>;
  if (v === false) return <span className="inline-flex items-center gap-1.5 text-ink-3"><Minus className="h-4 w-4" aria-hidden />{t('landing.pricing.no')}</span>;
  if (v === 'months') return <span>{premium ? t('landing.pricing.unlimited') : t('landing.pricing.months', { count: 6 })}</span>;
  return <span>{v}</span>;
}

export function Pricing() {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-t border-line py-16 md:py-24">
      <Reveal><SectionHead id="pricing-title" eyebrow={t('landing.pricing.eyebrow')} title={t('landing.pricing.title')} sub={t('landing.pricing.sub')} /></Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:max-w-4xl">
        <Reveal>
          <Card className="flex h-full flex-col gap-4 p-6">
            <div><h3 className="text-lg font-semibold text-ink">{t('landing.pricing.free')}</h3><p className="text-sm text-ink-2">{t('landing.pricing.freeFor')}</p></div>
            <p className="num text-3xl font-semibold text-ink">{t('landing.pricing.freePrice')}</p>
            <Link to="/register" className="mt-auto"><Button variant="secondary" size="lg" className="w-full">{t('landing.pricing.ctaFree')}</Button></Link>
          </Card>
        </Reveal>
        <Reveal delay={100}>
          <Card className="flex h-full flex-col gap-4 border-accent p-6 ring-1 ring-accent">
            <div><h3 className="text-lg font-semibold text-ink">{t('landing.pricing.premium')}</h3><p className="text-sm text-ink-2">{t('landing.pricing.premiumFor')}</p></div>
            <p className="num text-3xl font-semibold text-ink">{formatMoney(PREMIUM_PRICE_VND, lang)} <span className="text-base font-normal text-ink-2">{t('landing.pricing.perMonth')}</span></p>
            <Link to="/register" className="mt-auto"><Button size="lg" className="w-full">{t('landing.pricing.ctaPremium')}</Button></Link>
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-8 max-w-4xl overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-left">
          <caption className="sr-only">{t('landing.pricing.compare')}</caption>
          <thead>
            <tr className="border-b border-line-strong text-sm text-ink-2">
              <th scope="col" className="py-3 pr-3 font-medium">{t('landing.pricing.feature')}</th>
              <th scope="col" className="px-3 py-3 font-medium">{t('landing.pricing.free')}</th>
              <th scope="col" className="py-3 pl-3 font-medium text-ink">{t('landing.pricing.premium')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-base">
            {ROWS.map((r) => (
              <tr key={r}>
                <th scope="row" className="py-3 pr-3 font-normal text-ink">{t(`landing.pricing.rows.${r}`)}</th>
                <td className="num px-3 py-3 text-ink-2"><Cell v={FREE_VALUE[r]} /></td>
                <td className="py-3 pl-3 text-ink">{r === 'csv' || r === 'advanced' || r === 'thresholds' ? <Cell v /> : r === 'history' ? <Cell v="months" premium /> : <span>{t('landing.pricing.unlimited')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-sm text-ink-3">{t('landing.pricing.note')}</p>
      </Reveal>
    </section>
  );
}

/* ---------- FAQ: native <details>, keyboard and screen-reader correct ---------- */
export function Faq() {
  const { t } = useTranslation();
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-line py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <Reveal><SectionHead id="faq-title" eyebrow={t('landing.faq.eyebrow')} title={t('landing.faq.title')} /></Reveal>
        <Reveal delay={100}>
          <div className="divide-y divide-line border-y border-line">
            {([1, 2, 3, 4, 5, 6] as const).map((n) => (
              <details key={n} className="group py-1">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-2 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {t(`landing.faq.q${n}`)}
                  <ChevronDown className="h-5 w-5 shrink-0 text-ink-2 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                </summary>
                <p className="pb-4 pr-9 text-base text-ink-2">{t(`landing.faq.a${n}`)}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="final-title" className="pb-16 md:pb-24">
      <Reveal className="flex flex-col items-start gap-5 rounded-2xl bg-accent p-6 text-accent-ink md:flex-row md:items-center md:justify-between md:p-10">
        <div>
          <h2 id="final-title" className="text-2xl font-semibold tracking-tight md:text-3xl">{t('landing.final.title')}</h2>
          <p className="mt-1 text-base opacity-90">{t('landing.final.sub')}</p>
        </div>
        <Link to="/register" className="inline-flex min-h-12 shrink-0 items-center rounded-md bg-surface px-6 text-base font-medium text-ink transition-opacity hover:opacity-90">{t('landing.hero.cta')}</Link>
      </Reveal>
    </section>
  );
}

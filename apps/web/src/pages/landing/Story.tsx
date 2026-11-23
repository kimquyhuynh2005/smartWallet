import { BellRing, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BUDGET_TEMPLATES } from '@smartwallet/shared';
import { useLang } from '@/hooks/useLang';
import { useInView, useReducedMotion } from '@/hooks/useReducedMotion';
import { formatMoney } from '@/lib/format';
import { groupsOf, planTemplate } from '@/lib/templates';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, CategoryIcon, Input, ProgressBar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui';
import { Reveal, SectionHead } from './Reveal';

const FOOD = { nameEn: 'Food & Drinks', nameVi: 'Ăn uống', type: 'EXPENSE' as const };

function useTypewriter(text: string, active: boolean, reduced: boolean) {
  const [n, setN] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) { setN(text.length); return; }
    if (!active) return;
    setN(0);
    const id = setInterval(() => setN((c) => { if (c >= text.length) { clearInterval(id); return c; } return c + 1; }), 70);
    return () => clearInterval(id);
  }, [text, active, reduced]);
  return text.slice(0, n);
}

/* ---------- loop 1: record ---------- */
function RecordLoop() {
  const { t } = useTranslation();
  const lang = useLang();
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(0.35);
  const note = useTypewriter(lang === 'en' ? 'Highlands coffee' : 'cà phê Highlands', seen, reduced);
  const suggested = note.length >= 8;
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
      <Reveal>
        <p className="eyebrow">{t('landing.story.loop1.tag')}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink md:text-2xl">{t('landing.story.loop1.title')}</h3>
        <p className="mt-3 max-w-xl text-base text-ink-2 md:text-lg">{t('landing.story.loop1.body')}</p>
        <ul className="mt-5 flex flex-col gap-2.5">
          {(['b1', 'b2', 'b3'] as const).map((k) => <li key={k} className="flex items-start gap-3 text-base text-ink"><Check className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />{t(`landing.story.loop1.${k}`)}</li>)}
        </ul>
      </Reveal>
      <Reveal delay={120}>
        {/* a still of the quick-add sheet: decorative, so hidden from assistive tech */}
        <div ref={ref} aria-hidden="true" className="pointer-events-none select-none">
          <Card className="flex flex-col gap-4 p-5 shadow-float">
            <p className="text-lg font-semibold text-ink">{t('landing.story.loop1.mockTitle')}</p>
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">{t('landing.story.loop1.mockAmount')}</p>
              <Input readOnly tabIndex={-1} value={formatMoney(65_000, lang).replace(/\s?(₫|VND)$/, '')} trailing="₫" className="num text-right" />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">{t('landing.story.loop1.mockNote')}</p>
              <Input readOnly tabIndex={-1} value={note + (note.length < 16 && !reduced ? '|' : '')} />
            </div>
            <div className="min-h-[5rem]">
              {suggested && (
                <div className={reduced ? '' : 'animate-rise-in'}>
                  <p className="mb-2 text-sm text-ink-2">{t('landing.story.loop1.mockSuggest')}</p>
                  <span className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent-soft py-1 pl-1.5 pr-3 text-sm text-ink">
                    <CategoryIcon category={FOOD} size="sm" className="!h-8 !w-8 rounded-full" />{lang === 'en' ? FOOD.nameEn : FOOD.nameVi}
                    <Badge tone="accent" className="!py-0">{t('landing.story.loop1.mockSuggested')}</Badge>
                  </span>
                </div>
              )}
            </div>
            <Button size="lg" tabIndex={-1}>{t('landing.story.loop1.mockSave')}</Button>
          </Card>
        </div>
      </Reveal>
    </div>
  );
}

/* ---------- loop 2: plan ---------- */
const SEG = ['bg-accent', 'bg-accent/70', 'bg-accent/45', 'bg-ink-3/60', 'bg-ink-3/40', 'bg-line-strong'];
const INCOME = 15_000_000;

function BudgetSplit({ kind }: { kind: '50_30_20' | '6_JARS' }) {
  const { t } = useTranslation();
  const lang = useLang();
  const plan = planTemplate(groupsOf(kind), INCOME);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {BUDGET_TEMPLATES[kind].map((g, i) => <span key={g.key} className={cn('h-full', SEG[i])} style={{ width: `${g.percent}%` }} />)}
      </div>
      <ul className="divide-y divide-line">
        {plan.groups.map((g, i) => (
          <li key={g.key} className="flex items-start gap-3 py-3">
            <span className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-sm', SEG[i], !g.rows.length && 'ring-1 ring-inset ring-line-strong')} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-ink">{t(`onb.d.groups.${g.key}`)} <span className="num font-normal text-ink-2">· {g.percent}%</span></p>
              <p className="text-sm text-ink-2">{g.rows.length ? g.rows.map((r) => (lang === 'en' ? r.nameEn : VI_NAME[r.nameEn] ?? r.nameEn)).join(' · ') : t('landing.story.loop2.savingsNote')}</p>
            </div>
            <p className="num shrink-0 text-base font-medium text-ink">{formatMoney(g.amount, lang)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
const VI_NAME: Record<string, string> = { Housing: 'Nhà ở', 'Food & Drinks': 'Ăn uống', Transport: 'Di chuyển', Bills: 'Hóa đơn', Shopping: 'Mua sắm', Entertainment: 'Giải trí', Health: 'Sức khỏe', Education: 'Học tập', Gifts: 'Quà tặng' };

function PlanLoop() {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <div className="rounded-2xl border border-line bg-sunken p-5 md:p-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <Reveal>
          <p className="eyebrow">{t('landing.story.loop2.tag')}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink md:text-2xl">{t('landing.story.loop2.title')}</h3>
          <p className="mt-3 max-w-xl text-base text-ink-2 md:text-lg">{t('landing.story.loop2.body')}</p>
        </Reveal>
        <Reveal delay={120}>
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-ink-2">{t('landing.story.loop2.income')}</p>
              <p className="num text-xl font-semibold text-ink">{formatMoney(INCOME, lang)}</p>
            </div>
            <Tabs defaultValue="50_30_20">
              <TabsList variant="segmented" aria-label={t('landing.story.loop2.tabs')}>
                <TabsTrigger value="50_30_20">{t('landing.story.loop2.t5030')}</TabsTrigger>
                <TabsTrigger value="6_JARS">{t('landing.story.loop2.t6jars')}</TabsTrigger>
              </TabsList>
              <TabsContent value="50_30_20" className="mt-4"><BudgetSplit kind="50_30_20" /></TabsContent>
              <TabsContent value="6_JARS" className="mt-4"><BudgetSplit kind="6_JARS" /></TabsContent>
            </Tabs>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

/* ---------- loop 3: warn ---------- */
function WarnLoop() {
  const { t } = useTranslation();
  const stages = [{ k: 's1', pct: 62 }, { k: 's2', pct: 83 }, { k: 's3', pct: 104 }] as const;
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
      <Reveal className="order-2 lg:order-1">
        <ol className="relative flex flex-col gap-6 border-l border-line-strong pl-6">
          {stages.map((s) => (
            <li key={s.k} className="relative">
              <span className="absolute -left-[31px] top-1 flex h-3 w-3 rounded-full border-2 border-paper bg-ink-3" aria-hidden />
              <Card className="flex flex-col gap-2 p-4">
                <ProgressBar percent={s.pct} label={t('landing.preview.budget')} />
                <p className="flex items-start gap-2 text-sm text-ink-2"><BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{t(`landing.story.loop3.${s.k}body`)}</span></p>
              </Card>
            </li>
          ))}
        </ol>
      </Reveal>
      <Reveal delay={120} className="order-1 lg:order-2">
        <p className="eyebrow">{t('landing.story.loop3.tag')}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink md:text-2xl">{t('landing.story.loop3.title')}</h3>
        <p className="mt-3 max-w-xl text-base text-ink-2 md:text-lg">{t('landing.story.loop3.body')}</p>
      </Reveal>
    </div>
  );
}

export function Story() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="story-title" id="story" className="flex flex-col gap-16 py-16 md:gap-24 md:py-24">
      <Reveal><SectionHead id="story-title" eyebrow={t('landing.story.eyebrow')} title={t('landing.story.title')} /></Reveal>
      <RecordLoop />
      <PlanLoop />
      <WarnLoop />
    </section>
  );
}

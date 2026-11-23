import { currentBudgetPeriod } from '@smartwallet/shared';
import { Check } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/auth';
import { useUpdateProfile } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatDate, type Lang } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast, useUi } from '@/stores/ui';
import { Alert, Avatar, Badge, Button, Field, Input, Select, Skeleton, ThemeToggle } from '@/ui';
import { PRESET_AVATARS } from './avatars';
import { Section } from './Section';

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function rangeOf(day: number, lang: Lang) {
  const { startsAt, endsAt } = currentBudgetPeriod(new Date(), day);
  return { from: formatDate(startsAt, lang, 'short'), to: formatDate(new Date(endsAt.getTime() - 86_400_000), lang, 'short') };
}

export function ProfileSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const setLanguage = useUi((s) => s.setLanguage);
  const me = useMe();
  const update = useUpdateProfile();
  const [name, setName] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);

  if (me.isPending) return <div className="flex flex-col gap-4" role="status" aria-label={tc('common.loading')}><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (me.isError) return <Alert tone="danger"><div className="flex flex-wrap items-center gap-3"><span>{tc('errors.unknown')}</span><Button size="sm" variant="secondary" onClick={() => void me.refetch()}>{tc('common.retry')}</Button></div></Alert>;

  const user = me.data;
  const fullName = name ?? user.fullName;
  const chosenDay = day ?? user.monthStartDay;
  const nameTrim = fullName.trim();
  const nameError = !nameTrim ? t('profile.fullNameRequired') : nameTrim.length > 100 ? t('profile.fullNameTooLong') : undefined;
  const save = (body: Parameters<typeof update.mutate>[0], after?: () => void) =>
    update.mutate(body, { onSuccess: () => { toast.success(t('saved')); after?.(); }, onError: () => toast.error(t('saveFailed')) });
  const range = rangeOf(chosenDay, lang);

  const onName = (e: FormEvent) => { e.preventDefault(); if (!nameError) save({ fullName: nameTrim }, () => setName(null)); };
  const pickLang = (l: Lang) => { setLanguage(l); if (user.locale !== l) update.mutate({ locale: l }, { onError: () => toast.error(t('saveFailed')) }); };

  return (
    <div className="flex flex-col gap-6">
      <Section
        title={t('plan.title')}
        action={<Badge tone={user.plan === 'PREMIUM' ? 'accent' : 'neutral'}>{user.plan === 'PREMIUM' ? t('plan.premium') : t('plan.free')}</Badge>}
        description={user.plan === 'PREMIUM' ? t('plan.premiumHint') : t('plan.freeHint')}
      >
        <Link to="/plans" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-accent underline underline-offset-4">{t('plan.see')}</Link>
      </Section>

      <Section title={t('profile.title')}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink" id="avatar-label">{t('profile.avatar')}</span>
          <div role="radiogroup" aria-labelledby="avatar-label" className="flex flex-wrap items-center gap-3">
            <AvatarChoice checked={!user.avatarUrl} label={t('profile.avatarInitials')} onPick={() => save({ avatarUrl: null })}>
              <Avatar name={user.fullName} size="lg" />
            </AvatarChoice>
            {PRESET_AVATARS.map((url, i) => (
              <AvatarChoice key={url} checked={user.avatarUrl === url} label={t('profile.avatarPreset', { n: i + 1 })} onPick={() => save({ avatarUrl: url })}>
                <img src={url} alt="" className="h-14 w-14 rounded-full" />
              </AvatarChoice>
            ))}
          </div>
          <p className="text-sm text-ink-2">{t('profile.avatarHint')}</p>
        </div>
        <form onSubmit={onName} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label={t('profile.fullName')} error={name !== null ? nameError : undefined}>
            <Input value={fullName} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
          </Field>
          <Field label={t('profile.email')} hint={t('profile.emailHint')}>
            <Input value={user.email} readOnly disabled />
          </Field>
          <div className="sm:col-span-2"><Button type="submit" loading={update.isPending} disabled={!!nameError || nameTrim === user.fullName}>{t('profile.save')}</Button></div>
        </form>
      </Section>

      <Section title={t('app.title')}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink" id="lang-label">{t('app.language')}</span>
          <div role="radiogroup" aria-labelledby="lang-label" className="inline-flex self-start rounded-md border border-line bg-sunken p-1">
            {(['vi', 'en'] as const).map((l) => (
              <button
                key={l} type="button" role="radio" aria-checked={lang === l} lang={l} onClick={() => pickLang(l)}
                className={cn('min-h-11 rounded-md px-3 text-sm font-medium transition-colors', lang === l ? 'bg-surface text-ink shadow-[0_0_0_1px_rgb(var(--line))]' : 'text-ink-2 hover:text-ink')}
              >
                {l === 'vi' ? 'Tiếng Việt' : 'English'}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-2">{t('app.languageHint')}</p>
        </div>
        <div className="flex flex-col gap-2"><span className="text-sm font-medium text-ink">{t('app.theme')}</span><div><ThemeToggle /></div></div>
        <Field label={t('app.currency')} hint={t('app.currencyHint')}><Input value={t('app.currencyValue')} readOnly disabled /></Field>
      </Section>

      <Section title={t('period.title')} description={t('period.hint')}>
        <Field label={t('period.label')}>
          <Select value={String(chosenDay)} onChange={(e) => setDay(Number(e.target.value))} options={DAYS.map((d) => ({ value: String(d), label: t('period.day', { d }) }))} />
        </Field>
        <p className="rounded-md bg-sunken px-3 py-2 text-sm text-ink" aria-live="polite">
          <span className="text-ink-2">{t('period.current', { d: chosenDay })}: </span><span className="num font-medium">{t('period.range', range)}</span>
        </p>
        <div><Button onClick={() => save({ monthStartDay: chosenDay }, () => setDay(null))} loading={update.isPending} disabled={chosenDay === user.monthStartDay}>{t('period.save')}</Button></div>
      </Section>
    </div>
  );
}

function AvatarChoice({ checked, label, onPick, children }: { checked: boolean; label: string; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" role="radio" aria-checked={checked} aria-label={label} title={label} onClick={onPick}
      className={cn('relative flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors', checked ? 'border-accent' : 'border-transparent hover:border-line-strong')}
    >
      {children}
      {checked && <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink"><Check className="h-3.5 w-3.5" aria-hidden /></span>}
    </button>
  );
}

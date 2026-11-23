import { useTranslation } from 'react-i18next';
import { useUi } from '@/stores/ui';
import type { Lang } from '@/lib/format';
import { cn } from '@/lib/utils';

const LANGS: { value: Lang; short: string; key: 'vi' | 'en' }[] = [
  { value: 'vi', short: 'VI', key: 'vi' },
  { value: 'en', short: 'EN', key: 'en' },
];

export function LanguageToggle({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const language = useUi((s) => s.language);
  const setLanguage = useUi((s) => s.setLanguage);
  return (
    <div role="radiogroup" aria-label={t('settings.language')} className="inline-flex rounded-md border border-line bg-sunken p-1">
      {LANGS.map(({ value, short, key }) => (
        <button
          key={value} type="button" role="radio" aria-checked={language === value} onClick={() => setLanguage(value)} lang={value}
          className={cn('min-h-11 rounded-md px-2 text-sm font-medium transition-colors', language === value ? 'bg-surface text-ink shadow-[0_0_0_1px_rgb(var(--line))]' : 'text-ink-2 hover:text-ink')}
        >
          {compact ? short : t(`settings.${key}`)}
        </button>
      ))}
    </div>
  );
}

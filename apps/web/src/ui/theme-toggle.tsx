import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUi, type Theme } from '@/stores/ui';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; Icon: typeof Sun; key: 'light' | 'dark' | 'system' }[] = [
  { value: 'light', Icon: Sun, key: 'light' },
  { value: 'dark', Icon: Moon, key: 'dark' },
  { value: 'system', Icon: Monitor, key: 'system' },
];

/** Segmented switch. `compact` hides the labels (header); they stay available to screen readers. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  return (
    <div role="radiogroup" aria-label={t('settings.theme')} className="inline-flex rounded-md border border-line bg-sunken p-1">
      {OPTIONS.map(({ value, Icon, key }) => (
        <button
          key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => setTheme(value)}
          className={cn('flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors', theme === value ? 'bg-surface text-ink shadow-[0_0_0_1px_rgb(var(--line))]' : 'text-ink-2 hover:text-ink')}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className={compact ? 'sr-only' : undefined}>{t(`settings.${key}`)}</span>
        </button>
      ))}
    </div>
  );
}

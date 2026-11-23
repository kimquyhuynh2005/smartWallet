import { useQueryClient } from '@tanstack/react-query';
import { Gem } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { qk, useNotificationSettings, useUpdateNotificationSettings } from '@/api';
import { toast } from '@/stores/ui';
import { Alert, Badge, Button, Skeleton, Switch } from '@/ui';
import { Section } from './Section';

const KEYS = ['inApp', 'email', 'weeklySummary', 'goalReminders'] as const;
type Key = (typeof KEYS)[number];

export function NotificationsSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation();
  const qc = useQueryClient();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();

  const toggle = (k: Key, v: boolean) => {
    const prev = qc.getQueryData(qk.notifications.settings);
    qc.setQueryData(qk.notifications.settings, { ...(prev as object), [k]: v }); // optimistic
    update.mutate({ [k]: v }, { onError: () => { qc.setQueryData(qk.notifications.settings, prev); toast.error(t('saveFailed')); } });
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('notifications.title')} description={t('notifications.hint')}>
        {settings.isPending ? (
          <div className="flex flex-col gap-3" role="status" aria-label={tc('common.loading')}>{KEYS.map((k) => <Skeleton key={k} className="h-14 w-full" />)}</div>
        ) : settings.isError ? (
          <Alert tone="danger"><div className="flex flex-wrap items-center gap-3"><span>{t('notifications.loadFailed')}</span><Button size="sm" variant="secondary" onClick={() => void settings.refetch()}>{tc('common.retry')}</Button></div></Alert>
        ) : (
          <ul className="flex flex-col">
            {KEYS.map((k) => (
              <li key={k} className="flex items-start justify-between gap-4 border-t border-line py-3 first:border-0 first:pt-0">
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink">{t(`notifications.${k}`)}</p>
                  <p className="mt-0.5 max-w-prose text-sm text-ink-2">{t(`notifications.${k}Desc`)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="w-8 text-right text-sm text-ink-2" aria-hidden>{settings.data[k] ? t('notifications.on') : t('notifications.off')}</span>
                  <span className="-my-2 flex min-h-11 min-w-11 items-center justify-center"><Switch label={t(`notifications.${k}`)} checked={settings.data[k]} onChange={(v) => toggle(k, v)} /></span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('notifications.thresholdsTitle')} description={t('notifications.thresholdsDesc')}
        action={<Badge tone="accent" icon={<Gem />}>{t('notifications.premiumTag')}</Badge>}
      >
        <Link to="/budgets" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-accent underline underline-offset-4">{t('notifications.thresholdsLink')}</Link>
      </Section>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { PageHeader } from '@/features/common/parts';
import { cn } from '@/lib/utils';
import { DataSection } from './DataSection';
import { NotificationsSection } from './NotificationsSection';
import { ProfileSection } from './ProfileSection';
import { SecuritySection } from './SecuritySection';

const TABS = [
  { to: '/settings', key: 'general' },
  { to: '/settings/notifications', key: 'notifications' },
  { to: '/settings/security', key: 'security' },
  { to: '/settings/data', key: 'data' },
] as const;

/** Settings (USER-01, USER-03, ALR-02). Sub-screens: /settings, /settings/notifications, /settings/security, /settings/data. */
export default function SettingsPage() {
  const { t } = useTranslation('settings');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <nav aria-label={t('tabsLabel')} className="scroll-hide -mx-4 mb-6 flex gap-5 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {TABS.map((tab) => (
          <NavLink
            key={tab.key} to={tab.to} end
            className={({ isActive }) => cn('-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 text-base font-medium transition-colors', isActive ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink')}
          >
            {t(`tabs.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
      <div className="max-w-3xl">
        <Routes>
          <Route index element={<ProfileSection />} />
          <Route path="notifications" element={<NotificationsSection />} />
          <Route path="security" element={<SecuritySection />} />
          <Route path="data" element={<DataSection />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </div>
    </>
  );
}

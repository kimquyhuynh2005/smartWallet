import { Gem, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { initialsOf } from '@/ui/avatar';
import { Avatar, Badge, LanguageToggle, Menu, MenuItem, MenuSeparator, ThemeToggle } from '@/ui';
import { useLogout, useMe } from '../auth';

export function AvatarMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const logout = useLogout();
  const premium = me.data?.plan === 'PREMIUM';
  return (
    <Menu label={`${initialsOf(me.data?.fullName ?? '?')}, ${t('nav.openMenu')}`} trigger={<Avatar name={me.data?.fullName ?? '?'} src={me.data?.avatarUrl} size="sm" decorative />} triggerClassName="rounded-full">
      <div className="px-3 pb-2 pt-1.5">
        <p className="truncate text-base font-semibold text-ink">{me.data?.fullName}</p>
        <p className="truncate text-sm text-ink-2">{me.data?.email}</p>
        <Badge tone={premium ? 'accent' : 'neutral'} className="mt-2">{premium ? 'Premium' : t('settings.free')}</Badge>
      </div>
      <MenuSeparator />
      <MenuItem icon={<Settings className="h-4 w-4" />} onSelect={() => navigate('/settings')}>{t('nav.settings')}</MenuItem>
      <MenuItem icon={<Gem className="h-4 w-4" />} onSelect={() => navigate('/plans')}>{t('nav.plans')}</MenuItem>
      {me.data?.role === 'ADMIN' && <MenuItem icon={<ShieldCheck className="h-4 w-4" />} onSelect={() => navigate('/admin')}>{t('nav.admin')}</MenuItem>}
      <MenuSeparator />
      <div role="none" className="flex flex-wrap items-center gap-2 px-1.5 py-1"><ThemeToggle compact /><LanguageToggle compact /></div>
      <MenuSeparator />
      <MenuItem icon={<LogOut className="h-4 w-4" />} onSelect={() => logout.mutate()}>{t('auth.logout')}</MenuItem>
    </Menu>
  );
}

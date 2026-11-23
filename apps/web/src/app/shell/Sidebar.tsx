import { Plus } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { Logo } from '../layouts/Logo';
import { PRIMARY, SECONDARY, type NavItem } from './nav';

const link = ({ isActive }: { isActive: boolean }) =>
  cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-medium transition-colors', isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-sunken hover:text-ink');

function Group({ items, label }: { items: NavItem[]; label: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map(({ to, key, Icon }) => <NavLink key={to} to={to} className={link}><Icon className="h-5 w-5" aria-hidden />{t(`nav.${key}`)}</NavLink>)}
    </nav>
  );
}

/** Desktop (lg+) sidebar: six everyday destinations, then the less frequent ones. */
export function Sidebar() {
  const { t } = useTranslation();
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  return (
    <aside aria-label={t('nav.sidebar')} className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-line p-4 lg:flex">
      <Logo to="/dashboard" className="px-3 pt-2" />
      <button type="button" onClick={() => openQuickAdd()} aria-keyshortcuts="N" className="flex min-h-12 items-center justify-between gap-2 rounded-md bg-accent px-4 text-base font-medium text-accent-ink transition-colors hover:bg-accent/90">
        <span className="flex items-center gap-2"><Plus className="h-5 w-5" aria-hidden />{t('nav.add')}</span>
        <kbd className="rounded-sm border border-accent-ink/30 px-1.5 text-xs font-medium" aria-hidden>N</kbd>
      </button>
      <Group items={PRIMARY} label={t('nav.main')} />
      <div className="h-px bg-line" aria-hidden />
      <Group items={SECONDARY} label={t('nav.more')} />
    </aside>
  );
}

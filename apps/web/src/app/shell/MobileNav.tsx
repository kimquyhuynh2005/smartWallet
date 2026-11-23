import { Ellipsis, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { Sheet } from '@/ui';
import { useMe } from '../auth';
import { isActivePath, MOBILE_LEFT, MOBILE_MORE, MOBILE_RIGHT, type NavItem } from './nav';

function Tab({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  return (
    <NavLink to={item.to} className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors', isActive ? 'text-accent' : 'text-ink-3 hover:text-ink')}>
      <item.Icon className="h-6 w-6" aria-hidden /><span>{t(`nav.${item.key}`)}</span>
    </NavLink>
  );
}

/** Mobile bottom navigation: 2 tabs, a raised Add button in the middle (one thumb-tap from anywhere), Budgets, and a More sheet for the rest. */
export function MobileNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const isAdmin = useMe().data?.role === 'ADMIN';
  const [more, setMore] = useState(false);
  const moreActive = MOBILE_MORE.some((i) => isActivePath(pathname, i.to));
  return (
    <>
      <nav aria-label={t('nav.mobile')} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MOBILE_LEFT.map((i) => <Tab key={i.to} item={i} />)}
        <div className="flex justify-center pb-2">
          <button type="button" onClick={() => openQuickAdd()} aria-label={t('nav.add')} className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-paper bg-accent text-accent-ink shadow-float transition-transform active:scale-95 motion-reduce:active:scale-100">
            <Plus className="h-6 w-6" aria-hidden />
          </button>
        </div>
        {MOBILE_RIGHT.map((i) => <Tab key={i.to} item={i} />)}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors', moreActive ? 'text-accent' : 'text-ink-3 hover:text-ink')}>
          <Ellipsis className="h-6 w-6" aria-hidden /><span>{t('nav.more')}</span>
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore} title={t('nav.moreTitle')}>
        <nav aria-label={t('nav.moreTitle')} className="-mx-1 flex flex-col">
          {[...MOBILE_MORE, ...(isAdmin ? [{ to: '/admin', key: 'admin', Icon: ShieldCheck } as NavItem] : [])].map(({ to, key, Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMore(false)} className={({ isActive }) => cn('flex min-h-12 items-center gap-3 rounded-md px-3 text-base font-medium', isActive ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-sunken')}>
              <Icon className="h-5 w-5" aria-hidden />{t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
      </Sheet>
    </>
  );
}

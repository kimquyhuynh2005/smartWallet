import { ChartNoAxesColumn, Gem, LayoutDashboard, PiggyBank, Receipt, Settings, Tags, Target, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem { to: string; key: string; Icon: LucideIcon; /** shows the month switcher in the top bar */ period?: boolean }

/** The six everyday destinations (desktop sidebar, top group). Labels: `nav.<key>` */
export const PRIMARY: NavItem[] = [
  { to: '/dashboard', key: 'home', Icon: LayoutDashboard, period: true },
  { to: '/transactions', key: 'transactions', Icon: Receipt, period: true },
  { to: '/wallets', key: 'wallets', Icon: Wallet },
  { to: '/budgets', key: 'budgets', Icon: PiggyBank, period: true },
  { to: '/goals', key: 'goals', Icon: Target },
  { to: '/reports', key: 'reports', Icon: ChartNoAxesColumn, period: true },
];
/** Less frequent (desktop sidebar, bottom group; mobile More sheet) */
export const SECONDARY: NavItem[] = [
  { to: '/categories', key: 'categories', Icon: Tags },
  { to: '/plans', key: 'plans', Icon: Gem },
  { to: '/settings', key: 'settings', Icon: Settings },
];
/** mobile bottom bar: two tabs, the raised add button, two tabs; everything else lives in the More sheet */
export const MOBILE_LEFT = [PRIMARY[0], PRIMARY[1]];
export const MOBILE_RIGHT = [PRIMARY[3]];
export const MOBILE_MORE = [PRIMARY[2], PRIMARY[4], PRIMARY[5], ...SECONDARY];

export const isActivePath = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);
export const showsPeriod = (pathname: string) => PRIMARY.some((n) => n.period && isActivePath(pathname, n.to));

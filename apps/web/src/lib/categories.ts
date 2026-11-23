import {
  ArrowLeftRight, Banknote, Briefcase, Car, Clapperboard, Ellipsis, Gift, GraduationCap, HandCoins, HeartPulse, House, Receipt, ShoppingBag, Tag, Trophy, Utensils,
  Baby, BookOpen, Bus, Coffee, Dumbbell, Fuel, Landmark, Music, PawPrint, Phone, PiggyBank, Plane, Shirt, Wallet, Wifi,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryLike { nameEn?: string; nameVi?: string; icon?: string | null; color?: string | null; type?: 'INCOME' | 'EXPENSE' }
export interface CategoryVisual { Icon: LucideIcon; /** css color value, safe for style= */ color: string; key: string }

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, car: Car, home: House, receipt: Receipt, 'shopping-bag': ShoppingBag, clapperboard: Clapperboard, 'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse, gift: Gift, ellipsis: Ellipsis, banknote: Banknote, 'hand-coins': HandCoins, briefcase: Briefcase, trophy: Trophy, tag: Tag,
  'arrow-left-right': ArrowLeftRight,
  // extra choices for custom categories (picker in features/categories)
  coffee: Coffee, plane: Plane, bus: Bus, dumbbell: Dumbbell, music: Music, 'paw-print': PawPrint, baby: Baby, phone: Phone, wifi: Wifi, fuel: Fuel, shirt: Shirt, 'book-open': BookOpen, 'piggy-bank': PiggyBank, wallet: Wallet, landmark: Landmark,
};

/** default categories: one icon + one muted hue, used identically everywhere (docs/frontend-guide.md §2) */
const BY_NAME: Record<string, { icon: string; key: string }> = {
  'food & drinks': { icon: 'utensils', key: 'food' }, transport: { icon: 'car', key: 'transport' }, housing: { icon: 'home', key: 'housing' },
  bills: { icon: 'receipt', key: 'bills' }, shopping: { icon: 'shopping-bag', key: 'shopping' }, entertainment: { icon: 'clapperboard', key: 'entertainment' },
  education: { icon: 'graduation-cap', key: 'education' }, health: { icon: 'heart-pulse', key: 'health' }, gifts: { icon: 'gift', key: 'gifts' },
  salary: { icon: 'banknote', key: 'salary' }, allowance: { icon: 'hand-coins', key: 'allowance' }, 'part-time': { icon: 'briefcase', key: 'parttime' }, bonus: { icon: 'trophy', key: 'bonus' },
};

export const TRANSFER_VISUAL: CategoryVisual = { Icon: ArrowLeftRight, color: 'rgb(var(--ink-2))', key: 'transfer' };

export function categoryVisual(c?: CategoryLike | null): CategoryVisual {
  if (!c) return { Icon: Tag, color: 'rgb(var(--cat-other))', key: 'other' };
  const hit = c.nameEn ? BY_NAME[c.nameEn.toLowerCase()] : undefined;
  if (hit) return { Icon: ICONS[hit.icon], color: `rgb(var(--cat-${hit.key}))`, key: hit.key };
  if (c.nameEn?.toLowerCase() === 'other') return { Icon: Ellipsis, color: 'rgb(var(--cat-other))', key: 'other' };
  // custom category: its own color if it has a valid one, else a neutral
  const color = c.color && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : 'rgb(var(--ink-3))';
  return { Icon: (c.icon && ICONS[c.icon]) || Tag, color, key: 'custom' };
}

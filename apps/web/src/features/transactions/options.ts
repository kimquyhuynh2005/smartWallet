import type { Category, Wallet } from '@/api';
import { categoryName } from '@/hooks/useCategories';
import type { Lang } from '@/lib/format';

/** categories of one type as a flat list for a <select>: parents first, each followed by its sub-categories (indented with an en dash) */
export function categoryOptions(cats: Category[] | undefined, lang: Lang, type?: 'INCOME' | 'EXPENSE') {
  const list = (cats ?? []).filter((c) => !type || c.type === type);
  const roots = list.filter((c) => !c.parentId);
  const out: { value: string; label: string }[] = [];
  for (const r of roots) {
    out.push({ value: r.id, label: categoryName(r, lang) });
    for (const c of list.filter((x) => x.parentId === r.id)) out.push({ value: c.id, label: `– ${categoryName(c, lang)}` });
  }
  // sub-categories whose parent is of another type cannot exist; orphans are shown anyway so nothing disappears
  for (const c of list.filter((x) => x.parentId && !roots.some((r) => r.id === x.parentId))) out.push({ value: c.id, label: categoryName(c, lang) });
  return out;
}

/** wallets that may take an entry: never archived ones (the API answers 409 WALLET_ARCHIVED); `keep` stays listed so an existing entry can show its own wallet */
export const walletOptions = (wallets: Wallet[] | undefined, keep?: string) =>
  (wallets ?? []).filter((w) => !w.isArchived || w.id === keep).map((w) => ({ value: w.id, label: w.name }));

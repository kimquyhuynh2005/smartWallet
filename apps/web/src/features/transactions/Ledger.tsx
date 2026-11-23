import { ArrowRight, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryList, useWallets, type Category, type Transaction } from '@/api';
import { dayHeading } from '@/features/common/parts';
import { categoryName } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { formatDate, vnDayKey } from '@/lib/format';
import { AmountText, Card, CategoryIcon, Menu, MenuItem } from '@/ui';
import { EditTransaction } from './EditTransaction';
import { useDeleteWithUndo, useHiddenTxns } from './pendingDelete';
import { SwipeRow } from './SwipeRow';

interface RowProps { txn: Transaction; category?: Category; walletName?: string; toWalletName?: string; onEdit: () => void; onDelete: () => void }

function LedgerRow({ txn, category, walletName, toWalletName, onEdit, onDelete }: RowProps) {
  const { t } = useTranslation('transactions');
  const lang = useLang();
  const transfer = txn.type === 'TRANSFER';
  const catLabel = categoryName(category, lang, t('uncategorized'));
  const title = txn.note || (transfer ? t('transfer') : catLabel);
  const time = formatDate(txn.occurredAt, lang, 'time');
  return (
    <SwipeRow editLabel={t('edit')} deleteLabel={t('delete')} onEdit={onEdit} onDelete={onDelete}>
      <div className="flex items-center gap-3 py-2.5 pl-1 pr-0.5 md:pl-2">
        <CategoryIcon category={category} transfer={transfer} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-base font-medium text-ink md:truncate" lang={lang}>{title}</p>
          <p className="text-sm text-ink-2 md:truncate">
            {transfer ? (
              <>
                <span className="flex flex-col md:inline-flex md:flex-row md:items-center md:gap-1">
                  <span className="break-words md:truncate">{walletName ?? '…'}</span>
                  <span className="flex items-center gap-1"><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="sr-only">{t('to')}</span><span className="break-words md:truncate">{toWalletName ?? '…'}</span></span>
                </span>
                <span className="hidden md:inline"> · {time}</span>
              </>
            ) : (
              <>
                <span>{catLabel} · {time}</span>
                {walletName && <span className="block md:inline"><span className="hidden md:inline"> · </span>{walletName}</span>}
              </>
            )}
          </p>
        </div>
        <AmountText amount={txn.amount} kind={txn.type === 'INCOME' ? 'income' : txn.type === 'EXPENSE' ? 'expense' : 'transfer'} className={transfer ? 'shrink-0 text-ink' : 'shrink-0'} />
        <Menu label={t('rowActions', { name: title })} trigger={<Ellipsis className="h-5 w-5 text-ink-2" aria-hidden />} triggerClassName="shrink-0">
          <MenuItem icon={<Pencil className="h-4 w-4" />} onSelect={onEdit}>{t('edit')}</MenuItem>
          <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onSelect={onDelete}>{t('delete')}</MenuItem>
        </Menu>
      </div>
    </SwipeRow>
  );
}

/**
 * Transactions grouped by Vietnam day, each day with its own income/expense total (transfers are never counted).
 * Owns the edit dialog and delete-with-undo, so every screen that lists transactions behaves the same.
 */
export function TransactionGroups({ rows }: { rows: Transaction[] }) {
  const { t } = useTranslation('transactions');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const cats = useCategoryList();
  const wallets = useWallets(true);
  const hidden = useHiddenTxns((s) => s.ids);
  const remove = useDeleteWithUndo();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const catMap = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data]);
  const walletMap = useMemo(() => new Map((wallets.data ?? []).map((w) => [w.id, w])), [wallets.data]);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const r of rows) {
      if (hidden.has(r.id)) continue;
      const k = vnDayKey(r.occurredAt);
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return [...m.entries()];
  }, [rows, hidden]);

  return (
    <>
      <div className="flex flex-col gap-5">
        {groups.map(([day, items]) => {
          const income = items.filter((x) => x.type === 'INCOME').reduce((a, x) => a + x.amount, 0);
          const expense = items.filter((x) => x.type === 'EXPENSE').reduce((a, x) => a + x.amount, 0);
          const heading = dayHeading(items[0].occurredAt, lang, tc);
          return (
            <section key={day} aria-label={heading}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 px-1">
                <h2 className="eyebrow">{heading}</h2>
                <p className="ml-auto flex gap-3 text-sm text-ink-2">
                  {income > 0 && <span className="inline-flex items-baseline gap-1"><span>{t('dayIncome')}</span><AmountText amount={income} kind="income" size="sm" /></span>}
                  {expense > 0 && <span className="inline-flex items-baseline gap-1"><span>{t('dayExpense')}</span><AmountText amount={expense} kind="expense" size="sm" /></span>}
                </p>
              </div>
              <Card className="px-2 py-1 md:px-3 md:py-1.5">
                <ul className="divide-y divide-line">
                  {items.map((x) => (
                    <LedgerRow
                      key={x.id} txn={x} category={x.categoryId ? catMap.get(x.categoryId) : undefined}
                      walletName={walletMap.get(x.walletId)?.name} toWalletName={x.transferWalletId ? walletMap.get(x.transferWalletId)?.name : undefined}
                      onEdit={() => setEditing(x)} onDelete={() => remove(x)}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          );
        })}
      </div>
      {editing && <EditTransaction txn={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

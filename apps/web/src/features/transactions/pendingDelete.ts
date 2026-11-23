import { create } from 'zustand';
import { useTranslation } from 'react-i18next';
import { useDeleteTransaction, type Transaction } from '@/api';
import { toast } from '@/stores/ui';

/** ids hidden from every list while their (delayed) DELETE is pending */
export const useHiddenTxns = create<{ ids: Set<string>; hide: (id: string) => void; show: (id: string) => void }>((set) => ({
  ids: new Set(),
  hide: (id) => set((s) => ({ ids: new Set(s.ids).add(id) })),
  show: (id) => set((s) => { const n = new Set(s.ids); n.delete(id); return { ids: n }; }),
}));

const UNDO_MS = 5000;

/**
 * Delete with undo: the row disappears at once (optimistic), the real DELETE is sent after 5 s.
 * "Undo" cancels the timer and shows the row again. The timer lives in the closure, so it still fires if the user leaves the screen.
 */
export function useDeleteWithUndo() {
  const { t } = useTranslation('transactions');
  const del = useDeleteTransaction();
  const { hide, show } = useHiddenTxns.getState();
  return (txn: Transaction) => {
    hide(txn.id);
    const timer = setTimeout(() => {
      del.mutateAsync(txn.id).then(() => show(txn.id)).catch(() => show(txn.id)); // on failure the row comes back (the global handler already toasted)
    }, UNDO_MS);
    toast.show({ kind: 'info', title: t('deleted'), action: { label: t('undo'), onClick: () => { clearTimeout(timer); show(txn.id); } } });
  };
}

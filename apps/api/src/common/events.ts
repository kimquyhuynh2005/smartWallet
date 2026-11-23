export const TRANSACTION_CHANGED = 'transaction.changed';
export const GOAL_CONTRIBUTION_CHANGED = 'goal.contribution.changed';

export interface TxSnapshot {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  walletId: string;
  transferWalletId: string | null;
  categoryId: string | null;
  amount: number;
  occurredAt: Date;
}

/**
 * Published AFTER the database transaction that changed money has committed.
 * `current` = rows as they are now (empty for deletes); `previous` = rows as they were (empty for creates).
 * Consumers: budget alerts (now), reports/notifications (later). Never mutate money from a listener.
 */
export interface TransactionChangedEvent {
  userId: string;
  action: 'created' | 'updated' | 'deleted' | 'imported' | 'generated' | 'wallet_deleted';
  current: TxSnapshot[];
  previous: TxSnapshot[];
}

export interface GoalContributionChangedEvent {
  userId: string;
  goalId: string;
  amount: number;
  savedAmount: number;
  status: 'ACTIVE' | 'ACHIEVED' | 'CANCELED';
}

export const snapshot = (t: { id: string; type: any; walletId: string; transferWalletId: string | null; categoryId: string | null; amount: bigint; occurredAt: Date }): TxSnapshot => ({
  id: t.id,
  type: t.type,
  walletId: t.walletId,
  transferWalletId: t.transferWalletId,
  categoryId: t.categoryId,
  amount: Number(t.amount),
  occurredAt: t.occurredAt,
});

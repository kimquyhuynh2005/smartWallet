import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Skeleton } from '@/ui';
import TransactionsList from './TransactionsList';

const Recurring = lazy(() => import('./RecurringPage'));
const Import = lazy(() => import('./ImportPage'));
const fallback = <div className="flex flex-col gap-4 py-4" role="status"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;

/** /transactions (list) · /transactions/recurring (TXN-05) · /transactions/import (TXN-06) */
export default function TransactionsPage() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route index element={<TransactionsList />} />
        <Route path="recurring" element={<Recurring />} />
        <Route path="import" element={<Import />} />
        <Route path="*" element={<Navigate to="/transactions" replace />} />
      </Routes>
    </Suspense>
  );
}

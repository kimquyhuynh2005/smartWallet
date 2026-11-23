import { Archive, ArchiveRestore, ArrowLeft, ArrowLeftRight, Pencil, Plus, Receipt, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isApiError, useTransactions, useWallet } from '@/api';
import { TransactionGroups } from '@/features/transactions';
import { useUi } from '@/stores/ui';
import { Alert, AmountText, Badge, Button, buttonVariants, Card, EmptyState, Skeleton } from '@/ui';
import { useArchive } from './WalletsList';
import { DeleteWalletDialog, WalletForm, WalletGlyph } from './parts';

export default function WalletDetail() {
  const { t } = useTranslation('wallets');
  const { id = '' } = useParams();
  const nav = useNavigate();
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const wallet = useWallet(id);
  const recent = useTransactions({ walletId: id, limit: 10 });
  const archive = useArchive();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);

  const back = <Link to="/wallets" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-3 mb-1' })}><ArrowLeft className="h-4 w-4" aria-hidden />{t('title')}</Link>;

  if (wallet.isLoading) return <>{back}<Skeleton className="mb-4 h-10 w-64" /><Skeleton className="mb-6 h-32" /><Skeleton className="h-64" /></>;
  if (wallet.isError || !wallet.data) {
    const missing = isApiError(wallet.error) && wallet.error.status === 404;
    return (
      <>
        {back}
        <EmptyState icon={TriangleAlert} title={missing ? t('detail.notFound') : t('loadError')} action={missing ? <Link to="/wallets" className={buttonVariants({ variant: 'secondary' })}>{t('detail.backToList')}</Link> : <Button variant="secondary" onClick={() => void wallet.refetch()}>{t('retry')}</Button>}>
          {missing ? t('detail.notFoundHint') : t('loadErrorHint')}
        </EmptyState>
      </>
    );
  }
  const w = wallet.data;
  const rows = recent.data?.data ?? [];

  return (
    <>
      {back}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <WalletGlyph type={w.type} color={w.color} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-ink md:text-2xl">{w.name}</h1>
            <p className="flex items-center gap-2 text-sm text-ink-2">{t(`types.${w.type}`)}{w.isArchived && <Badge icon={<Archive />}>{t('archivedBadge')}</Badge>}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <p className="text-sm text-ink-2">{t('balance')}</p>
            <AmountText amount={w.balance} kind="balance" size="hero" />
            <p className="mt-2 text-sm text-ink-3">{t('detail.balanceNote')}</p>
          </Card>
          {w.isArchived && <Alert tone="info">{t('detail.archivedNote')}</Alert>}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => openQuickAdd({ mode: 'EXPENSE', walletId: w.id })} disabled={w.isArchived}><Plus className="h-4 w-4" aria-hidden />{t('detail.addTxn')}</Button>
            <Button variant="secondary" onClick={() => openQuickAdd({ mode: 'TRANSFER', walletId: w.id })} disabled={w.isArchived}><ArrowLeftRight className="h-4 w-4" aria-hidden />{t('transfer')}</Button>
            <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" aria-hidden />{t('edit')}</Button>
            <Button variant="secondary" onClick={() => archive(w)}>{w.isArchived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}{w.isArchived ? t('restore') : t('archive')}</Button>
          </div>
          <Button variant="ghost" className="self-start text-danger hover:text-danger" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" aria-hidden />{t('delete.action')}</Button>
        </div>

        <section aria-labelledby="wallet-recent" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="wallet-recent" className="text-lg font-semibold text-ink">{t('detail.recent')}</h2>
            <Link to={`/transactions?walletId=${w.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>{t('detail.openList')}</Link>
          </div>
          {recent.isLoading ? (
            <Card aria-busy="true"><div className="flex flex-col gap-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div></Card>
          ) : recent.isError ? (
            <EmptyState icon={TriangleAlert} title={t('loadError')} action={<Button variant="secondary" onClick={() => void recent.refetch()}>{t('retry')}</Button>} />
          ) : !rows.length ? (
            <EmptyState icon={Receipt} title={t('detail.noTxn')} action={w.isArchived ? undefined : <Button onClick={() => openQuickAdd({ walletId: w.id })}><Plus className="h-4 w-4" aria-hidden />{t('detail.addTxn')}</Button>}>{t('detail.noTxnHint')}</EmptyState>
          ) : <TransactionGroups rows={rows} />}
        </section>
      </div>

      {edit && <WalletForm wallet={w} onClose={() => setEdit(false)} />}
      {del && <DeleteWalletDialog wallet={w} onClose={() => setDel(false)} onDeleted={() => nav('/wallets', { replace: true })} />}
    </>
  );
}

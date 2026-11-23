import { Archive, ArchiveRestore, ArrowLeftRight, Ellipsis, Pencil, Plus, Trash2, TriangleAlert, Wallet as WalletIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useUpdateWallet, useWallets, type Wallet } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { toast, useUi } from '@/stores/ui';
import { AmountText, Badge, Button, Card, EmptyState, Menu, MenuItem, Skeleton, Switch } from '@/ui';
import { cn } from '@/lib/utils';
import { DeleteWalletDialog, WalletForm, WalletGlyph } from './parts';

/** archive / restore with one tap: reversible, so no confirm, just a toast. (Restoring may hit the Free wallet cap: the global dialog answers that.) */
export function useArchive() {
  const { t } = useTranslation('wallets');
  const update = useUpdateWallet();
  return (w: Wallet) => update.mutate({ id: w.id, body: { isArchived: !w.isArchived } }, { onSuccess: () => toast.success(w.isArchived ? t('restored', { name: w.name }) : t('archivedToast', { name: w.name })) });
}

function WalletCard({ w, onEdit, onDelete }: { w: Wallet; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation('wallets');
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const archive = useArchive();
  return (
    <Card className={cn('relative flex h-full flex-col gap-4', w.isArchived && 'bg-sunken/60')}>
      <div className="flex items-start gap-3">
        <WalletGlyph type={w.type} color={w.color} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-ink">
            <Link to={`/wallets/${w.id}`} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{w.name}</Link>
          </h2>
          <p className="text-sm text-ink-2">{t(`types.${w.type}`)}</p>
        </div>
        <div className="relative z-10">
          <Menu label={t('actions', { name: w.name })} trigger={<Ellipsis className="h-5 w-5 text-ink-2" aria-hidden />} triggerClassName="-mr-2 -mt-1">
            <MenuItem icon={<Pencil className="h-4 w-4" />} onSelect={onEdit}>{t('edit')}</MenuItem>
            {!w.isArchived && <MenuItem icon={<ArrowLeftRight className="h-4 w-4" />} onSelect={() => openQuickAdd({ mode: 'TRANSFER', walletId: w.id })}>{t('transfer')}</MenuItem>}
            <MenuItem icon={w.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} onSelect={() => archive(w)}>{w.isArchived ? t('restore') : t('archive')}</MenuItem>
            <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onSelect={onDelete}>{t('delete.action')}</MenuItem>
          </Menu>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-ink-2">{t('balance')}</p>
          <AmountText amount={w.balance} kind="balance" size="xl" />
        </div>
        {w.isArchived && <Badge icon={<Archive />}>{t('archivedBadge')}</Badge>}
      </div>
    </Card>
  );
}

export default function WalletsList() {
  const { t } = useTranslation('wallets');
  const openQuickAdd = useUi((s) => s.openQuickAdd);
  const [showArchived, setShowArchived] = useState(false);
  const wallets = useWallets(showArchived);
  const [form, setForm] = useState<{ wallet?: Wallet } | null>(null);
  const [deleting, setDeleting] = useState<Wallet | null>(null);
  const items = wallets.data ?? [];
  const active = items.filter((w) => !w.isArchived).length;

  return (
    <>
      <PageHeader
        title={t('title')} subtitle={wallets.isSuccess ? t('subtitle', { count: active }) : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openQuickAdd({ mode: 'TRANSFER' })} disabled={active < 2}><ArrowLeftRight className="h-4 w-4" aria-hidden />{t('transfer')}</Button>
            <Button onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden />{t('add')}</Button>
          </div>
        }
      />
      <label className="mb-4 flex min-h-11 cursor-pointer items-center gap-3">
        <Switch checked={showArchived} onChange={setShowArchived} label={t('showArchived')} />
        <span className="text-sm text-ink-2" aria-hidden>{t('showArchived')}</span>
      </label>

      {wallets.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : wallets.isError ? (
        <EmptyState icon={TriangleAlert} title={t('loadError')} action={<Button variant="secondary" onClick={() => void wallets.refetch()}>{t('retry')}</Button>}>{t('loadErrorHint')}</EmptyState>
      ) : !items.length ? (
        <EmptyState icon={WalletIcon} title={t('empty')} action={<Button onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden />{t('add')}</Button>}>{t('emptyHint')}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => <li key={w.id} className="min-w-0"><WalletCard w={w} onEdit={() => setForm({ wallet: w })} onDelete={() => setDeleting(w)} /></li>)}
        </ul>
      )}
      {!wallets.isLoading && !showArchived && items.length > 0 && <p className="mt-4 text-sm text-ink-3">{t('archivedHidden')}</p>}

      {form && <WalletForm key={form.wallet?.id ?? 'new'} wallet={form.wallet} onClose={() => setForm(null)} />}
      {deleting && <DeleteWalletDialog wallet={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}

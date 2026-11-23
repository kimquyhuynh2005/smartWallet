import { ArrowDownUp, Ban, CircleCheck, Lock, LockOpen, Search, Users as UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminUsers, useProfile, useUpdateAdminUser } from '@/api';
import { useLang } from '@/hooks/useLang';
import { formatDate } from '@/lib/format';
import { toast } from '@/stores/ui';
import { Avatar, Badge, Button, Card, EmptyState, Input, ResponsiveDialog, Select, Skeleton } from '@/ui';
import { mutationMessage, QueryState, useDebounced } from './shared';

type U = NonNullable<ReturnType<typeof useAdminUsers>['data']>[number];
const PAGE = 15;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

export default function Users() {
  const { t } = useTranslation('admin');
  const q = useAdminUsers();
  return (
    <Card className="p-0 md:p-0">
      <div className="border-b border-line p-4 md:p-5"><h2 className="text-lg font-semibold text-ink">{t('users.title')}</h2><p className="mt-0.5 text-sm text-ink-2">{t('users.subtitle')}</p></div>
      <div className="p-4 md:p-5">
        <QueryState q={q} skeleton={<div className="flex flex-col gap-3"><Skeleton className="h-11" /><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}>
          {(list) => <UserList list={list} />}
        </QueryState>
      </div>
    </Card>
  );
}

function UserList({ list }: { list: U[] }) {
  const { t } = useTranslation('admin');
  const me = useProfile().data?.id;
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState<U | null>(null);
  const term = norm(useDebounced(search).trim());

  const rows = useMemo(() => {
    const f = list.filter((u) => (!term || norm(u.fullName).includes(term) || norm(u.email).includes(term)) && (!plan || (u.plan ?? 'FREE') === plan) && (!status || u.status === status));
    return f.sort((a, b) => (newestFirst ? -1 : 1) * a.createdAt.localeCompare(b.createdAt));
  }, [list, term, plan, status, newestFirst]);
  const reset = () => setShown(PAGE);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]">
        <div className="sm:col-span-2 lg:col-span-1">
          <Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder={t('users.search')} aria-label={t('users.search')} leading={<Search className="h-4 w-4" aria-hidden />} />
        </div>
        <Select aria-label={t('users.filterPlan')} value={plan} onChange={(e) => { setPlan(e.target.value); reset(); }} options={[{ value: '', label: t('users.allPlans') }, { value: 'FREE', label: t('plan.FREE') }, { value: 'PREMIUM', label: t('plan.PREMIUM') }]} />
        <Select aria-label={t('users.filterStatus')} value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} options={[{ value: '', label: t('users.allStatuses') }, { value: 'ACTIVE', label: t('status.ACTIVE') }, { value: 'LOCKED', label: t('status.LOCKED') }]} />
        <Button variant="secondary" className="sm:col-span-2 lg:col-span-1" onClick={() => setNewestFirst((v) => !v)} aria-label={t('users.sortLabel', { order: newestFirst ? t('users.newest') : t('users.oldest') })}>
          <ArrowDownUp className="h-4 w-4" aria-hidden />{newestFirst ? t('users.newest') : t('users.oldest')}
        </Button>
      </div>
      <p className="mb-2 text-sm text-ink-2" aria-live="polite">{t('users.count', { count: rows.length, total: list.length })}</p>

      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t('users.emptyTitle')} action={(term || plan || status) ? <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setPlan(''); setStatus(''); }}>{t('users.clear')}</Button> : undefined}>{t('users.emptyBody')}</EmptyState>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,2fr)_6.5rem_8rem_9.5rem_6rem_9rem] gap-3 border-b border-line px-2 pb-2 text-sm font-medium text-ink-2 lg:grid" aria-hidden>
            <span>{t('users.colUser')}</span><span>{t('users.colRole')}</span><span>{t('users.colPlan')}</span><span>{t('users.colStatus')}</span><span>{t('users.colCreated')}</span><span />
          </div>
          <ul className="divide-y divide-line">
            {rows.slice(0, shown).map((u) => <UserRow key={u.id} u={u} self={u.id === me} onLock={() => setConfirm(u)} />)}
          </ul>
          {rows.length > shown && <div className="mt-4"><Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>{t('users.more', { count: Math.min(PAGE, rows.length - shown) })}</Button></div>}
        </>
      )}
      {confirm && <LockDialog u={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}

function StatusTag({ status }: { status: U['status'] }) {
  const { t } = useTranslation('admin');
  return status === 'ACTIVE'
    ? <Badge className="whitespace-nowrap" tone="accent" icon={<CircleCheck />}>{t('status.ACTIVE')}</Badge>
    : <Badge className="whitespace-nowrap" tone="danger" icon={<Lock />}>{t('status.LOCKED')}</Badge>;
}

function UserRow({ u, self, onLock }: { u: U; self: boolean; onLock: () => void }) {
  const { t } = useTranslation('admin');
  const lang = useLang();
  const update = useUpdateAdminUser();
  const isAdmin = u.role === 'ADMIN';
  const plan = u.plan ?? 'FREE';

  const changePlan = (next: 'FREE' | 'PREMIUM') => {
    if (next === plan) return;
    update.mutate({ id: u.id, body: { plan: next } }, {
      onSuccess: () => toast.success(t('users.planChanged', { name: u.fullName, plan: t(`plan.${next}`) })),
      onError: (e) => toast.error(mutationMessage(e, t)),
    });
  };

  return (
    <li className="grid gap-x-3 gap-y-2 px-0 py-3 lg:grid-cols-[minmax(0,2fr)_6.5rem_8rem_9.5rem_6rem_9rem] lg:items-center lg:px-2">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={u.fullName} size="sm" />
        <div className="min-w-0"><p className="truncate font-medium text-ink">{u.fullName}{self && <span className="ml-2 text-xs font-normal text-ink-2">({t('users.you')})</span>}</p><p className="truncate text-sm text-ink-2">{u.email}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:contents">
        <span><Badge className="whitespace-nowrap" tone={isAdmin ? 'warn' : 'neutral'}><span className="sr-only">{t('users.colRole')}: </span>{t(`role.${u.role}`)}</Badge></span>
        <span className="lg:min-w-0">
          {isAdmin || self
            ? <Badge className="whitespace-nowrap"><span className="sr-only">{t('users.colPlan')}: </span>{t(`plan.${plan}`)}</Badge>
            : <Select aria-label={t('users.planOf', { name: u.fullName })} value={plan} disabled={update.isPending} onChange={(e) => changePlan(e.target.value as 'FREE' | 'PREMIUM')} className="min-h-11 py-1 text-sm" options={[{ value: 'FREE', label: t('plan.FREE') }, { value: 'PREMIUM', label: t('plan.PREMIUM') }]} />}
        </span>
        <span><StatusTag status={u.status} /></span>
        <span className="num text-sm text-ink-2"><span className="sr-only">{t('users.colCreated')}: </span>{formatDate(u.createdAt, lang, 'short')}</span>
      </div>
      <div className="lg:text-right">
        {isAdmin || self
          ? <span className="inline-flex items-center gap-1.5 text-sm text-ink-3"><Ban className="h-4 w-4" aria-hidden />{t(self ? 'users.protectedSelf' : 'users.protectedAdmin')}</span>
          : <Button size="sm" variant="secondary" className="min-h-11" onClick={onLock} aria-label={t(u.status === 'ACTIVE' ? 'users.lockFor' : 'users.unlockFor', { name: u.fullName })}>
            {u.status === 'ACTIVE' ? <><Lock className="h-4 w-4" aria-hidden />{t('users.lock')}</> : <><LockOpen className="h-4 w-4" aria-hidden />{t('users.unlock')}</>}
          </Button>}
      </div>
    </li>
  );
}

function LockDialog({ u, onClose }: { u: U; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const update = useUpdateAdminUser();
  const locking = u.status === 'ACTIVE';
  const go = () => update.mutate({ id: u.id, body: { status: locking ? 'LOCKED' : 'ACTIVE' } }, {
    onSuccess: () => { toast.success(t(locking ? 'users.locked' : 'users.unlocked', { name: u.fullName })); onClose(); },
    onError: (e) => { toast.error(mutationMessage(e, t)); onClose(); },
  });
  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={t(locking ? 'users.lockTitle' : 'users.unlockTitle', { name: u.fullName })}
      footer={<><Button variant={locking ? 'destructive' : 'primary'} onClick={go} loading={update.isPending}>{locking ? t('users.lock') : t('users.unlock')}</Button><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button></>}
    >
      <p className="text-base text-ink">{t(locking ? 'users.lockBody' : 'users.unlockBody', { email: u.email })}</p>
    </ResponsiveDialog>
  );
}

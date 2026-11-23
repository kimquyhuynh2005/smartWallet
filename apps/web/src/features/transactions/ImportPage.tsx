import { ArrowLeft, CircleAlert, CircleCheck, Copy, FileSpreadsheet, Lock, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MAX_CSV_BYTES } from '@smartwallet/shared';
import { describeError, isApiError, useCategoryList, useImportConfirm, useImportPreview, useWallets } from '@/api';
import type { endpoints } from '@/api';
import { useMe } from '@/app/auth';
import { PageHeader } from '@/features/common/parts';
import { categoryName } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';
import { Alert, AmountText, Badge, Button, buttonVariants, Card, EmptyState, Field, Select, Skeleton } from '@/ui';
import { walletOptions } from './options';

type Preview = Awaited<ReturnType<typeof endpoints.transactions.importPreview>>;
type Row = Preview['rows'][number];
type Status = 'new' | 'duplicate' | 'invalid';
const statusOf = (r: Row): Status => (r.errors.length ? 'invalid' : r.duplicate ? 'duplicate' : 'new');

function DropZone({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled?: boolean }) {
  const { t } = useTranslation('transactions');
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const take = (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') { setProblem(t('import.notCsv')); return; }
    if (f.size > MAX_CSV_BYTES) { setProblem(t('import.tooBig', { mb: Math.round(MAX_CSV_BYTES / 1024 / 1024) })); return; }
    setProblem(null);
    onFile(f);
  };
  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files[0]); }}
        className={cn('flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 transition-colors', over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-sunken/50')}
      >
        <FileSpreadsheet className="h-6 w-6 text-ink-3" aria-hidden />
        {file ? (
          <p className="text-base font-medium text-ink">{file.name} <span className="text-sm font-normal text-ink-2">({Math.max(1, Math.round(file.size / 1024))} KB)</span></p>
        ) : (
          <div className="flex flex-col gap-1"><p className="text-base font-semibold text-ink">{t('import.drop')}</p><p className="text-sm text-ink-2">{t('import.dropHint', { mb: Math.round(MAX_CSV_BYTES / 1024 / 1024) })}</p></div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={disabled}><Upload className="h-4 w-4" aria-hidden />{file ? t('import.change') : t('import.pick')}</Button>
      </div>
      {problem && <Alert tone="danger">{problem}</Alert>}
    </div>
  );
}

function StatusBadge({ s }: { s: Status }) {
  const { t } = useTranslation('transactions');
  if (s === 'new') return <Badge tone="accent" icon={<CircleCheck />}>{t('import.status.new')}</Badge>;
  if (s === 'duplicate') return <Badge tone="warn" icon={<Copy />}>{t('import.status.duplicate')}</Badge>;
  return <Badge tone="danger" icon={<CircleAlert />}>{t('import.status.invalid')}</Badge>;
}

export default function ImportPage() {
  const { t } = useTranslation('transactions');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const meQuery = useMe();
  const me = meQuery.data;
  const wallets = useWallets();
  const cats = useCategoryList();
  const preview = useImportPreview();
  const confirm = useImportConfirm();
  const [walletId, setWalletId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const catMap = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data]);
  const options = walletOptions(wallets.data);
  const wallet = walletId || options[0]?.value || '';

  const back = <Link to="/transactions" className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-3 mb-1' })}><ArrowLeft className="h-4 w-4" aria-hidden />{t('title')}</Link>;

  if (meQuery.isLoading) return <>{back}<Skeleton className="mb-4 h-8 w-64" /><Skeleton className="h-48 max-w-xl" /></>;

  // Free plan: a friendly locked state, no paywall of our own (the global dialog answers the 403 if the API is asked anyway)
  if (me && me.plan !== 'PREMIUM' && !done) {
    return (
      <>
        {back}
        <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />
        <EmptyState icon={Lock} title={t('import.locked')} action={<Link to="/plans" className={buttonVariants({ variant: 'primary' })}>{t('import.seePlans')}</Link>}>{t('import.lockedHint')}</EmptyState>
      </>
    );
  }

  const run = () => {
    if (!file || !wallet) return;
    setExpired(false);
    preview.mutate({ walletId: wallet, file }, {
      onSuccess: (p) => { setData(p); setPicked(new Set(p.rows.filter((r) => statusOf(r) === 'new').map((r) => r.line))); },
    });
  };
  const reset = () => { setData(null); setFile(null); setDone(null); setExpired(false); };

  if (done) {
    return (
      <>
        {back}
        <PageHeader title={t('import.title')} />
        <Card className="flex flex-col items-start gap-4">
          <CircleCheck className="h-6 w-6 text-accent" aria-hidden />
          <div><p className="text-lg font-semibold text-ink">{t('import.doneTitle', { count: done.imported })}</p><p className="mt-1 text-sm text-ink-2">{t('import.doneBody', { count: done.skipped })}</p></div>
          <div className="flex flex-wrap gap-2">
            <Link to="/transactions" className={buttonVariants({})}>{t('import.viewList')}</Link>
            <Button variant="secondary" onClick={reset}>{t('import.another')}</Button>
          </div>
        </Card>
      </>
    );
  }

  if (data) {
    const rows = data.rows;
    const counts = { new: 0, duplicate: 0, invalid: 0 };
    rows.forEach((r) => { counts[statusOf(r)]++; });
    const importable = rows.filter((r) => !r.errors.length);
    const chosen = importable.filter((r) => picked.has(r.line));
    const toggle = (line: number) => setPicked((s) => { const n = new Set(s); if (n.has(line)) n.delete(line); else n.add(line); return n; });
    const submit = () => {
      const excludeLines = importable.filter((r) => !picked.has(r.line)).map((r) => r.line);
      const includeDuplicates = chosen.some((r) => r.duplicate);
      confirm.mutate({ importId: data.importId, body: { includeDuplicates, excludeLines } }, {
        onSuccess: (r) => { toast.success(t('import.doneTitle', { count: r.imported })); setDone({ imported: r.imported, skipped: r.skipped }); },
        onError: (e) => { if (isApiError(e) && e.code === 'IMPORT_NOT_FOUND') setExpired(true); },
      });
    };
    const walletLabel = wallets.data?.find((w) => w.id === data.walletId)?.name ?? '';
    return (
      <>
        {back}
        <PageHeader title={t('import.previewTitle')} subtitle={t('import.previewSubtitle', { wallet: walletLabel })} />
        <ul className="mb-4 flex flex-wrap gap-2" aria-label={t('import.summary')}>
          <li><Badge tone="accent" icon={<CircleCheck />} className="px-3 py-1 text-sm">{t('import.count.new', { count: counts.new })}</Badge></li>
          <li><Badge tone="warn" icon={<Copy />} className="px-3 py-1 text-sm">{t('import.count.duplicate', { count: counts.duplicate })}</Badge></li>
          <li><Badge tone="danger" icon={<CircleAlert />} className="px-3 py-1 text-sm">{t('import.count.invalid', { count: counts.invalid })}</Badge></li>
        </ul>
        {expired && <Alert tone="danger" className="mb-4">{t('import.expired')}</Alert>}
        {counts.duplicate > 0 && <Alert tone="info" className="mb-4">{t('import.duplicateHint')}</Alert>}
        {!importable.length ? (
          <EmptyState icon={CircleAlert} title={t('import.nothing')} action={<Button variant="secondary" onClick={reset}>{t('import.another')}</Button>}>{t('import.nothingHint')}</EmptyState>
        ) : (
          <Card className="p-0 md:p-0">
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const s = statusOf(r);
                const cat = r.categoryId ? catMap.get(r.categoryId) : undefined;
                const id = `imp-${r.line}`;
                return (
                  <li key={r.line} className={cn('flex items-start gap-3 px-3 py-3 md:px-4', s === 'invalid' && 'bg-danger-soft/40')}>
                    <input
                      id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--accent))]" disabled={s === 'invalid'} checked={picked.has(r.line)} onChange={() => toggle(r.line)}
                      aria-label={t('import.include', { line: r.line })}
                    />
                    <label htmlFor={id} className="min-w-0 flex-1">
                      <span className="block truncate text-base text-ink" lang={lang}>{r.note ?? '—'}</span>
                      <span className="num block truncate text-sm text-ink-2">{[r.date ? formatDate(r.date, lang, 'short') : '—', s === 'invalid' ? null : cat ? categoryName(cat, lang) : t('uncategorized')].filter(Boolean).join(' · ')}</span>
                      {s === 'invalid' && <span className="block whitespace-normal break-words text-sm font-medium text-danger">{r.errors.join(', ')}</span>}
                    </label>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {r.amount !== null && r.type ? <AmountText amount={r.amount} kind={r.type === 'INCOME' ? 'income' : 'expense'} size="sm" /> : <span className="text-sm text-ink-3">—</span>}
                      <StatusBadge s={s} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {importable.length > 0 && (
          <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 lg:bottom-4">
            <p className="mr-auto text-sm text-ink-2">{t('import.selected', { count: chosen.length })}</p>
            <Button variant="ghost" onClick={reset}>{t('cancel')}</Button>
            <Button onClick={submit} loading={confirm.isPending} disabled={!chosen.length || expired}>{t('import.confirm', { count: chosen.length })}</Button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />
      {wallets.isLoading ? <Skeleton className="h-48 max-w-xl" /> : wallets.isError ? (
        <EmptyState icon={CircleAlert} title={t('loadError')} action={<Button variant="secondary" onClick={() => void wallets.refetch()}>{t('retry')}</Button>} />
      ) : !options.length ? (
        <EmptyState icon={CircleAlert} title={t('import.noWallet')} action={<Link to="/wallets" className={buttonVariants({ variant: 'primary' })}>{t('import.createWallet')}</Link>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="flex flex-col gap-4">
            <Field label={t('import.wallet')} hint={t('import.walletHint')}>
              <Select value={wallet} onChange={(e) => setWalletId(e.target.value)} options={options} />
            </Field>
            <DropZone file={file} onFile={setFile} />
            {preview.isError && <Alert tone="danger">{describeError(preview.error, tc)}</Alert>}
            <Button className="self-start" onClick={run} loading={preview.isPending} disabled={!file}>{t('import.preview')}</Button>
          </Card>
          <Card className="self-start">
            <h2 className="text-lg font-semibold text-ink">{t('import.formatTitle')}</h2>
            <p className="mt-1 text-sm text-ink-2">{t('import.formatBody')}</p>
            <pre className="num mt-3 overflow-x-auto rounded-md bg-sunken p-3 text-sm text-ink" lang="vi">{t('import.formatSample')}</pre>
            <p className="mt-3 text-sm text-ink-2">{t('import.formatNote')}</p>
          </Card>
        </div>
      )}
    </>
  );
}

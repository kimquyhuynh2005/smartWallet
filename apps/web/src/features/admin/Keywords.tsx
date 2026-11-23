import { Info, Plus, Search, Tag, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminCategories, useAdminRules, useCreateAdminRule, useDeleteAdminRule } from '@/api';
import { useLang } from '@/hooks/useLang';
import { toast } from '@/stores/ui';
import { Alert, Button, Card, CategoryIcon, EmptyState, Field, Input, Select, Skeleton } from '@/ui';
import { mutationMessage, normalizeKeyword, QueryState, useDebounced } from './shared';

export default function Keywords() {
  const { t } = useTranslation('admin');
  const lang = useLang();
  const cats = useAdminCategories();
  const rules = useAdminRules();
  const create = useCreateAdminRule();
  const del = useDeleteAdminRule();
  const [categoryId, setCategoryId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [err, setErr] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [search, setSearch] = useState('');
  const term = normalizeKeyword(useDebounced(search));

  const catName = (c: { nameVi: string; nameEn: string }) => (lang === 'en' ? c.nameEn : c.nameVi);

  const groups = useMemo(() => {
    const cl = cats.data ?? [];
    const rl = rules.data ?? [];
    return cl
      .map((c) => ({ c, items: rl.filter((r) => r.categoryId === c.id && (!term || r.keyword.includes(term) || normalizeKeyword(catName(c)).includes(term))).sort((a, b) => a.keyword.localeCompare(b.keyword)) }))
      .filter((g) => g.items.length > 0)
      .sort((a, b) => catName(a.c).localeCompare(catName(b.c), lang));
  }, [cats.data, rules.data, term, lang]);

  const add = () => {
    setSaved(undefined);
    const k = keyword.trim();
    if (!categoryId) return setErr(t('kw.pickCategory'));
    if (!k) return setErr(t('kw.keywordRequired'));
    setErr(undefined);
    create.mutate({ keyword: k, categoryId }, {
      onSuccess: (r) => { setSaved(r.keyword); setKeyword(''); toast.success(t('kw.added', { keyword: r.keyword })); },
      onError: (e) => setErr(mutationMessage(e, t)),
    });
  };

  const q = { isLoading: cats.isLoading || rules.isLoading, isError: cats.isError || rules.isError, error: cats.error ?? rules.error, data: cats.data && rules.data ? true : undefined, refetch: () => { void cats.refetch(); void rules.refetch(); }, isFetching: cats.isFetching || rules.isFetching };

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info"><span className="inline-flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('kw.how')}</span></Alert>
      <QueryState q={q} skeleton={<div className="flex flex-col gap-3"><Skeleton className="h-28" /><Skeleton className="h-40" /></div>}>
        {() => (
          <>
            <Card>
              <h2 className="mb-3 text-lg font-semibold text-ink">{t('kw.addTitle')}</h2>
              <form onSubmit={(e) => { e.preventDefault(); add(); }} noValidate className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <Field label={t('kw.category')}><Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder={t('kw.pick')} options={(cats.data ?? []).map((c) => ({ value: c.id, label: `${catName(c)} (${t(`cat.type.${c.type}`)})` }))} /></Field>
                <Field label={t('kw.keyword')} error={err} hint={saved ? undefined : t('kw.hint')}><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={60} placeholder={t('kw.placeholder')} /></Field>
                <Button type="submit" loading={create.isPending}><Plus className="h-4 w-4" aria-hidden />{t('kw.add')}</Button>
              </form>
              {saved && <p role="status" className="mt-3 text-sm text-ink-2">{t('kw.savedAs')} <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-ink">{saved}</code></p>}
            </Card>

            <div>
              <div className="mb-3 max-w-md"><Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('kw.search')} aria-label={t('kw.search')} leading={<Search className="h-4 w-4" aria-hidden />} /></div>
              {groups.length === 0 ? <EmptyState icon={Tag} title={term ? t('kw.noMatchTitle') : t('kw.emptyTitle')}>{term ? t('kw.noMatchBody') : t('kw.emptyBody')}</EmptyState> : (
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  {groups.map(({ c, items }) => (
                    <Card key={c.id} className="min-w-0">
                      <div className="mb-3 flex items-center gap-3"><CategoryIcon category={c} size="sm" /><h3 className="min-w-0 flex-1 truncate font-semibold text-ink">{catName(c)}</h3><span className="num text-sm text-ink-2">{items.length}</span></div>
                      <ul className="flex flex-wrap gap-2">
                        {items.map((r) => (
                          <li key={r.id} className="inline-flex items-center rounded-full border border-line-strong bg-sunken pl-3 text-sm text-ink">
                            {r.keyword}
                            <button type="button" aria-label={t('kw.removeFor', { keyword: r.keyword })} disabled={del.isPending} onClick={() => del.mutate(r.id, { onSuccess: () => toast.show({ kind: 'info', title: t('kw.removed', { keyword: r.keyword }), action: { label: t('kw.undo'), onClick: () => create.mutate({ keyword: r.keyword, categoryId: r.categoryId }, { onSuccess: () => toast.success(t('kw.restored', { keyword: r.keyword })), onError: (e) => toast.error(mutationMessage(e, t)) }) } }), onError: (e) => toast.error(mutationMessage(e, t)) })} className="ml-1 flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><X className="h-4 w-4" aria-hidden /></button>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}

import { Ellipsis, ListPlus, Lock, Pencil, Plus, Tag, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategoryList, useDeleteCategory, type Category } from '@/api';
import { PageHeader } from '@/features/common/parts';
import { categoryName } from '@/hooks/useCategories';
import { useLang } from '@/hooks/useLang';
import { toast } from '@/stores/ui';
import { Alert, Button, Card, CategoryIcon, Dialog, EmptyState, Menu, MenuItem, Skeleton, Tabs, TabsList, TabsTrigger } from '@/ui';
import { CategoryForm, type FormTarget } from './CategoryForm';

type Kind = 'EXPENSE' | 'INCOME';

function Row({ c, child, onEdit, onDelete, onAddSub }: { c: Category; child?: boolean; onEdit: () => void; onDelete: () => void; onAddSub?: () => void }) {
  const { t } = useTranslation('categories');
  const lang = useLang();
  const name = categoryName(c, lang);
  const other = lang === 'en' ? c.nameVi : c.nameEn;
  return (
    <li className={child ? 'flex min-w-0 items-center gap-3 py-2 pl-10 pr-1' : 'flex min-w-0 items-center gap-3 py-2.5 pr-1'}>
      <CategoryIcon category={c} size={child ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-base font-medium text-ink" lang={lang}>
          <span className="min-w-0 max-w-full truncate">{name}</span>
          {c.isSystem && <Lock className="h-4 w-4 shrink-0 text-ink-3" role="img" aria-label={t('system')} />}
        </p>
        {other && other !== name && <p className="truncate text-sm text-ink-3" lang={lang === 'en' ? 'vi' : 'en'}>{other}</p>}
      </div>
      {c.isSystem && !onAddSub ? <span className="sr-only">{t('systemReadonly')}</span> : (
        <Menu label={t('actions', { name })} trigger={<Ellipsis className="h-5 w-5 text-ink-2" aria-hidden />} triggerClassName="shrink-0">
          {onAddSub && <MenuItem icon={<ListPlus className="h-4 w-4" />} onSelect={onAddSub}>{t('addSub')}</MenuItem>}
          {!c.isSystem && <MenuItem icon={<Pencil className="h-4 w-4" />} onSelect={onEdit}>{t('edit')}</MenuItem>}
          {!c.isSystem && <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onSelect={onDelete}>{t('delete.action')}</MenuItem>}
        </Menu>
      )}
    </li>
  );
}

function DeleteDialog({ c, childCount, onClose }: { c: Category; childCount: number; onClose: () => void }) {
  const { t } = useTranslation('categories');
  const lang = useLang();
  const del = useDeleteCategory();
  const name = categoryName(c, lang);
  return (
    <Dialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={t('delete.title', { name })}
      footer={<>
        <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate(c.id, { onSuccess: () => { toast.success(t('delete.done', { name })); onClose(); } })}>{t('delete.confirm')}</Button>
        <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      </>}
    >
      <Alert tone="warning">{childCount > 0 ? t('delete.withChildren', { count: childCount }) : t('delete.noChildren')}</Alert>
      <p className="text-sm text-ink-2">{t('delete.budgetsRules')}</p>
      <p className="text-sm text-ink-2">{t('delete.keepPast')}</p>
    </Dialog>
  );
}

export default function CategoriesPage() {
  const { t } = useTranslation('categories');
  const cats = useCategoryList();
  const [kind, setKind] = useState<Kind>('EXPENSE');
  const [form, setForm] = useState<FormTarget | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const { roots, kids } = useMemo(() => {
    const list = (cats.data ?? []).filter((c) => c.type === kind);
    const ids = new Set(list.map((c) => c.id));
    const kids = new Map<string, Category[]>();
    for (const c of list) if (c.parentId && ids.has(c.parentId)) (kids.get(c.parentId) ?? kids.set(c.parentId, []).get(c.parentId)!).push(c);
    // custom first would bury the defaults; keep the API order but list defaults before the user's own so the tree reads the same every time
    const roots = list.filter((c) => !c.parentId || !ids.has(c.parentId)).sort((a, b) => Number(b.isSystem) - Number(a.isSystem));
    return { roots, kids };
  }, [cats.data, kind]);
  const mine = roots.filter((c) => !c.isSystem).length + [...kids.values()].flat().filter((c) => !c.isSystem).length;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<Button onClick={() => setForm({ type: kind })}><Plus className="h-4 w-4" aria-hidden />{t('add')}</Button>} />
      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)} className="mb-4">
        <TabsList variant="segmented" aria-label={t('title')}>
          <TabsTrigger value="EXPENSE">{t('expense')}</TabsTrigger>
          <TabsTrigger value="INCOME">{t('income')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {cats.isLoading ? (
        <Card aria-busy="true"><div className="flex flex-col gap-4">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div></Card>
      ) : cats.isError ? (
        <EmptyState icon={TriangleAlert} title={t('loadError')} action={<Button variant="secondary" onClick={() => void cats.refetch()}>{t('retry')}</Button>}>{t('loadErrorHint')}</EmptyState>
      ) : !roots.length ? (
        <EmptyState icon={Tag} title={t('empty')} action={<Button onClick={() => setForm({ type: kind })}><Plus className="h-4 w-4" aria-hidden />{t('add')}</Button>}>{t('emptyHint')}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="min-w-0 py-1 md:py-2">
            <ul className="w-full min-w-0 divide-y divide-line">
              {roots.map((r) => (
                <li key={r.id} className="min-w-0">
                  <ul>
                    <Row c={r} onEdit={() => setForm({ category: r })} onDelete={() => setDeleting(r)} onAddSub={() => setForm({ parent: r })} />
                    {(kids.get(r.id) ?? []).map((k) => <Row key={k.id} c={k} child onEdit={() => setForm({ category: k })} onDelete={() => setDeleting(k)} />)}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
          <div className="flex flex-col gap-3 self-start">
            <Card className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-base font-semibold text-ink"><Lock className="h-4 w-4 text-ink-3" aria-hidden />{t('help.defaultsTitle')}</p>
              <p className="text-sm text-ink-2">{t('help.defaults')}</p>
              <p className="text-sm text-ink-2">{t('help.levels')}</p>
              <p className="text-sm text-ink-3">{t('help.mine', { count: mine })}</p>
            </Card>
          </div>
        </div>
      )}

      {form && <CategoryForm key={form.category?.id ?? form.parent?.id ?? 'new'} target={form} onClose={() => setForm(null)} />}
      {deleting && <DeleteDialog c={deleting} childCount={(kids.get(deleting.id) ?? []).length} onClose={() => setDeleting(null)} />}
    </>
  );
}

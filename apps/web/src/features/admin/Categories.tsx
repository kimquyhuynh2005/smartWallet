import { Check, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateAdminCategory, useDeleteAdminCategory, useUpdateAdminCategory, useAdminCategories } from '@/api';
import { useLang } from '@/hooks/useLang';
import { categoryVisual } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';
import { Alert, Button, Card, CardHeader, CardTitle, CategoryIcon, EmptyState, Field, Input, ResponsiveDialog, Skeleton, Tabs, TabsList, TabsTrigger } from '@/ui';
import { COLOR_CHOICES, ICON_CHOICES, mutationMessage, QueryState } from './shared';

type Cat = NonNullable<ReturnType<typeof useAdminCategories>['data']>[number];
type Target = { cat?: Cat; type?: 'EXPENSE' | 'INCOME' };

export default function Categories() {
  const { t } = useTranslation('admin');
  const lang = useLang();
  const q = useAdminCategories();
  const [form, setForm] = useState<Target | null>(null);
  const [del, setDel] = useState<Cat | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-ink-2">{t('cat.intro')}</p>
      <QueryState q={q} skeleton={<div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}>
        {(list) => (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {(['EXPENSE', 'INCOME'] as const).map((type) => {
              const items = list.filter((c) => c.type === type).sort((a, b) => (lang === 'en' ? a.nameEn.localeCompare(b.nameEn) : a.nameVi.localeCompare(b.nameVi, 'vi')));
              return (
                <Card key={type} className="min-w-0">
                  <CardHeader>
                    <CardTitle>{t(`cat.type.${type}`)} <span className="num text-sm font-normal text-ink-2">({items.length})</span></CardTitle>
                    <Button size="sm" variant="secondary" onClick={() => setForm({ type })}><Plus className="h-4 w-4" aria-hidden />{t('cat.add')}</Button>
                  </CardHeader>
                  {items.length === 0 ? <EmptyState icon={Tag} title={t('cat.emptyTitle')}>{t('cat.emptyBody')}</EmptyState> : (
                    <ul className="divide-y divide-line">
                      {items.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 py-2.5">
                          <CategoryIcon category={c} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{lang === 'en' ? c.nameEn : c.nameVi}</p>
                            <p className="break-words text-sm text-ink-2">{lang === 'en' ? c.nameVi : c.nameEn} · {t('cat.keywords', { count: c.keywordCount })}</p>
                          </div>
                          <Button size="icon" variant="ghost" aria-label={t('cat.editFor', { name: lang === 'en' ? c.nameEn : c.nameVi })} onClick={() => setForm({ cat: c })}><Pencil className="h-4 w-4" aria-hidden /></Button>
                          <Button size="icon" variant="ghost" aria-label={t('cat.deleteFor', { name: lang === 'en' ? c.nameEn : c.nameVi })} onClick={() => setDel(c)}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </QueryState>
      {form && <CategoryDialog target={form} onClose={() => setForm(null)} />}
      {del && <DeleteDialog cat={del} onClose={() => setDel(null)} />}
    </div>
  );
}

function CategoryDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const lang = useLang();
  const create = useCreateAdminCategory();
  const update = useUpdateAdminCategory();
  const c = target.cat;
  const [nameVi, setNameVi] = useState(c?.nameVi ?? '');
  const [nameEn, setNameEn] = useState(c?.nameEn ?? '');
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>(c?.type ?? target.type ?? 'EXPENSE');
  const [icon, setIcon] = useState(c?.icon ?? 'tag');
  const [color, setColor] = useState(c?.color ?? COLOR_CHOICES[0]);
  const [tried, setTried] = useState(false);
  const viRef = useRef<HTMLInputElement>(null);
  const enRef = useRef<HTMLInputElement>(null);
  const busy = create.isPending || update.isPending;
  const viErr = tried && !nameVi.trim() ? t('cat.nameRequired') : undefined;
  const enErr = tried && !nameEn.trim() ? t('cat.nameRequired') : undefined;
  // preview without nameEn so the picked colour is shown (defaults are matched by name otherwise)
  const preview = useMemo(() => ({ icon, color }), [icon, color]);

  const submit = async () => {
    setTried(true);
    if (!nameVi.trim()) { viRef.current?.focus(); return; }
    if (!nameEn.trim()) { enRef.current?.focus(); return; }
    try {
      if (c) await update.mutateAsync({ id: c.id, body: { nameVi: nameVi.trim(), nameEn: nameEn.trim(), icon, color } });
      else await create.mutateAsync({ nameVi: nameVi.trim(), nameEn: nameEn.trim(), type, icon, color });
      toast.success(t(c ? 'cat.saved' : 'cat.created'));
      onClose();
    } catch (e) { toast.error(mutationMessage(e, t)); }
  };

  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={t(c ? 'cat.editTitle' : 'cat.newTitle')}
      footer={<><Button onClick={() => void submit()} loading={busy}>{t('save')}</Button><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button></>}
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md bg-sunken p-3" aria-hidden>
          <CategoryIcon category={preview} />
          <span className="truncate text-base font-medium text-ink">{(lang === 'en' ? nameEn || nameVi : nameVi) || t('cat.previewEmpty')}</span>
        </div>
        {c ? <p className="text-sm text-ink-2">{t('cat.typeFixed', { type: t(`cat.type.${c.type}`) })}</p> : (
          <Tabs value={type} onValueChange={(v) => setType(v as 'EXPENSE' | 'INCOME')}>
            <TabsList variant="segmented" className="flex w-full" aria-label={t('cat.typeLabel')}>
              <TabsTrigger value="EXPENSE" className="flex-1">{t('cat.type.EXPENSE')}</TabsTrigger>
              <TabsTrigger value="INCOME" className="flex-1">{t('cat.type.INCOME')}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Field label={t('cat.nameVi')} error={viErr} required><Input ref={viRef} value={nameVi} onChange={(e) => setNameVi(e.target.value)} maxLength={60} lang="vi" /></Field>
        <Field label={t('cat.nameEn')} error={enErr} required><Input ref={enRef} value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} lang="en" /></Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">{t('cat.icon')}</legend>
          <div className="flex flex-wrap gap-2">
            {ICON_CHOICES.map((name) => {
              const { Icon } = categoryVisual({ icon: name, color });
              const on = icon === name;
              return (
                <label key={name} className="relative">
                  <input type="radio" name="adm-icon" className="peer sr-only" checked={on} onChange={() => setIcon(name)} aria-label={t(`cat.icons.${name}`)} />
                  <span className={cn('flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border text-ink-2 peer-focus-visible:ring-2 peer-focus-visible:ring-accent', on ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong hover:bg-sunken')}><Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden /></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">{t('cat.color')}</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_CHOICES.map((col, i) => (
              <label key={col} className="relative">
                <input type="radio" name="adm-color" className="peer sr-only" checked={color === col} onChange={() => setColor(col)} aria-label={t('cat.colorN', { n: i + 1 })} />
                <span className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-transparent peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent" style={{ backgroundColor: col }}>{color === col && <Check className="h-5 w-5 text-white" aria-hidden />}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveDialog>
  );
}

function DeleteDialog({ cat, onClose }: { cat: Cat; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const lang = useLang();
  const del = useDeleteAdminCategory();
  const name = lang === 'en' ? cat.nameEn : cat.nameVi;
  const go = () => del.mutate(cat.id, {
    onSuccess: () => { toast.success(t('cat.deleted', { name })); onClose(); },
    onError: (e) => { toast.error(mutationMessage(e, t)); onClose(); },
  });
  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={t('cat.deleteTitle', { name })}
      footer={<><Button variant="destructive" onClick={go} loading={del.isPending}>{t('cat.delete')}</Button><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button></>}
    >
      <p className="text-base text-ink">{t('cat.deleteBody')}</p>
      {cat.keywordCount > 0 && <Alert tone="warning">{t('cat.deleteKeywords', { count: cat.keywordCount })}</Alert>}
    </ResponsiveDialog>
  );
}

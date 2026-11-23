import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { applyFieldErrors, useCreateCategory, useUpdateCategory, type Category } from '@/api';
import { useLang } from '@/hooks/useLang';
import { categoryVisual } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';
import { Button, CategoryIcon, Field, Input, ResponsiveDialog, Tabs, TabsList, TabsTrigger } from '@/ui';

/** only icons the app can draw for a custom category (src/lib/categories.ts); lucide names */
export const ICON_CHOICES = ['tag', 'utensils', 'car', 'home', 'receipt', 'shopping-bag', 'clapperboard', 'graduation-cap', 'heart-pulse', 'gift', 'banknote', 'hand-coins', 'briefcase', 'trophy', 'ellipsis', 'coffee', 'plane', 'bus', 'dumbbell', 'music', 'paw-print', 'baby', 'phone', 'wifi', 'fuel', 'shirt', 'book-open', 'piggy-bank', 'wallet', 'landmark'] as const;
/** curated muted palette (the category hues of the design tokens); a colour is picked, never typed */
export const COLOR_CHOICES = ['#B85C38', '#4F6FA3', '#8C7442', '#A8841A', '#B2506F', '#2F8A85', '#5666A6', '#BC4A43', '#BE7358', '#737A74', '#2C7A58', '#4F955F', '#33868B', '#7E9A2E'] as const;

export interface FormTarget {
  /** edit this custom category */
  category?: Category;
  /** create a sub-category under this root */
  parent?: Category;
  /** create a root of this type */
  type?: 'EXPENSE' | 'INCOME';
}

/** CAT-02 create / edit. Sub-categories take their parent's type; system defaults never reach this form. */
export function CategoryForm({ target, onClose }: { target: FormTarget; onClose: () => void }) {
  const { t } = useTranslation('categories');
  const lang = useLang();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const { category, parent } = target;
  const type = category?.type ?? parent?.type ?? target.type ?? 'EXPENSE';

  const schema = useMemo(() => z.object({
    nameVi: z.string().trim().min(1, t('form.nameRequired')).max(60, t('form.nameTooLong')),
    nameEn: z.string().trim().max(60, t('form.nameTooLong')),
    type: z.enum(['EXPENSE', 'INCOME']),
    icon: z.string(),
    color: z.string(),
  }), [t]);
  type Values = z.infer<typeof schema>;
  const { control, register, handleSubmit, setError, watch, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { nameVi: category?.nameVi ?? '', nameEn: category?.nameEn ?? '', type, icon: category?.icon ?? 'tag', color: category?.color ?? COLOR_CHOICES[0] },
  });
  const v = watch();
  const typeFixed = !!(category || parent);

  const submit = handleSubmit(async (f) => {
    const nameVi = f.nameVi.trim();
    const nameEn = f.nameEn.trim() || nameVi;
    try {
      if (category) {
        const body: Record<string, unknown> = {};
        if (nameVi !== category.nameVi) body.nameVi = nameVi;
        if (nameEn !== category.nameEn) body.nameEn = nameEn;
        if (f.icon !== category.icon) body.icon = f.icon;
        if (f.color !== category.color) body.color = f.color;
        if (Object.keys(body).length) await update.mutateAsync({ id: category.id, body });
        toast.success(t('saved'));
      } else {
        await create.mutateAsync({ nameVi, nameEn, type: f.type, parentId: parent?.id ?? null, icon: f.icon, color: f.color });
        toast.success(t('created', { name: lang === 'en' ? nameEn : nameVi }));
      }
      onClose();
    } catch (e) {
      applyFieldErrors(e, setError);
    }
  });

  const title = category ? t('form.editTitle') : parent ? t('form.newSubTitle', { parent: lang === 'en' ? parent.nameEn : parent.nameVi }) : t('form.newTitle');
  const preview = { nameEn: undefined, icon: v.icon, color: v.color };

  return (
    <ResponsiveDialog
      open onOpenChange={(o) => { if (!o) onClose(); }} title={title}
      footer={<><Button onClick={submit} loading={create.isPending || update.isPending}>{t('save')}</Button><Button variant="ghost" onClick={onClose}>{t('cancel')}</Button></>}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md bg-sunken p-3" aria-hidden>
          <CategoryIcon category={preview} />
          <span className="truncate text-base font-medium text-ink">{(lang === 'en' ? v.nameEn || v.nameVi : v.nameVi) || t('form.previewEmpty')}</span>
        </div>
        {!typeFixed && (
          <Controller control={control} name="type" render={({ field }) => (
            <Tabs value={field.value} onValueChange={field.onChange}>
              <TabsList variant="segmented" className="flex w-full" aria-label={t('form.type')}>
                <TabsTrigger value="EXPENSE" className="flex-1">{t('expense')}</TabsTrigger>
                <TabsTrigger value="INCOME" className="flex-1">{t('income')}</TabsTrigger>
              </TabsList>
            </Tabs>
          )} />
        )}
        {parent && <p className="text-sm text-ink-2">{t('form.inherits', { type: t(parent.type === 'INCOME' ? 'income' : 'expense') })}</p>}
        <Field label={t('form.nameVi')} error={errors.nameVi?.message} required><Input {...register('nameVi')} maxLength={60} autoFocus lang="vi" /></Field>
        <Field label={t('form.nameEn')} error={errors.nameEn?.message} hint={t('form.nameEnHint')} optional><Input {...register('nameEn')} maxLength={60} lang="en" /></Field>

        <Controller control={control} name="icon" render={({ field }) => (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">{t('form.icon')}</legend>
            <div className="flex flex-wrap gap-2">
              {ICON_CHOICES.map((name) => {
                const { Icon } = categoryVisual({ icon: name, color: v.color });
                const on = field.value === name;
                return (
                  <label key={name} className="relative">
                    <input type="radio" name="cat-icon" className="peer sr-only" checked={on} onChange={() => field.onChange(name)} aria-label={t(`icons.${name}`)} />
                    <span className={cn('flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border text-ink-2 peer-focus-visible:ring-2 peer-focus-visible:ring-accent', on ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong hover:bg-sunken')}>
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )} />

        <Controller control={control} name="color" render={({ field }) => (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">{t('form.color')}</legend>
            <div className="flex flex-wrap gap-2">
              {COLOR_CHOICES.map((c) => (
                <label key={c} className="relative">
                  <input type="radio" name="cat-color" className="peer sr-only" checked={field.value === c} onChange={() => field.onChange(c)} aria-label={t(`colors.${c.slice(1)}`)} />
                  <span className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-transparent peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent" style={{ backgroundColor: c }}>
                    {field.value === c && <Check className="h-5 w-5 text-white" aria-hidden />}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveDialog>
  );
}

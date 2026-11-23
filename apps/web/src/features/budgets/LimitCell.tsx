import { Check, Pencil, X } from 'lucide-react';
import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, isPlanLimit, type Budget } from '@/api';
import { toast } from '@/stores/ui';
import { AmountText, Button, MoneyInput } from '@/ui';
import { useLang } from '@/hooks/useLang';
import { formatMoney } from '@/lib/format';
import { useEditLimit } from './helpers';

/**
 * The limit of a budget: tap to edit in place. Enter or leaving the field saves (optimistic, rolled back on error),
 * Esc or the X cancels, the check button is the touch-friendly save. A limit must be > 0.
 */
export function LimitCell({ budget, name, apiPeriod, size = 'lg' }: { budget: Budget; name: string; apiPeriod: string | undefined; size?: 'md' | 'lg' | 'xl' }) {
  const { t } = useTranslation('budgets');
  const { t: tc } = useTranslation();
  const lang = useLang();
  const edit = useEditLimit(apiPeriod);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | null>(budget.limitAmount);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  const open = () => { done.current = false; setValue(budget.limitAmount); setError(null); setEditing(true); };
  const close = () => { done.current = true; setEditing(false); setError(null); };
  const commit = () => {
    if (done.current) return;
    if (!value || value <= 0) { setError(t('row.limitInvalid')); return; }
    if (value === budget.limitAmount) { close(); return; }
    done.current = true;
    setEditing(false);
    edit.mutate({ id: budget.id, limit: value }, {
      onSuccess: () => toast.success(t('toast.limitSaved')),
      onError: (e) => { if (!isPlanLimit(e)) toast.error(describeError(e, tc)); },
    });
  };
  const onBlur = (e: FocusEvent) => { if (!box.current?.contains(e.relatedTarget as Node | null)) commit(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  if (!editing) {
    return (
      <button
        type="button" onClick={open} aria-label={`${formatMoney(budget.limitAmount, lang)}, ${t('row.editLimit', { name })}`}
        className="-mx-2 inline-flex min-h-11 max-w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-sunken"
      >
        <span className="min-w-0"><AmountText amount={budget.limitAmount} size={size} /></span>
        <Pencil className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      </button>
    );
  }
  return (
    <div ref={box} onBlur={onBlur} onKeyDown={onKey} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <MoneyInput autoFocus value={value} onChange={(v) => { setValue(v); setError(null); }} invalid={!!error} aria-label={t('row.editLimit', { name })} aria-describedby={error ? `${budget.id}-err` : undefined} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <Button size="icon" variant="primary" onMouseDown={(e) => e.preventDefault()} onClick={commit} aria-label={t('actions.save')}><Check className="h-5 w-5" aria-hidden /></Button>
        <Button size="icon" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={close} aria-label={t('actions.cancel')}><X className="h-5 w-5" aria-hidden /></Button>
      </div>
      {error && <p id={`${budget.id}-err`} role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

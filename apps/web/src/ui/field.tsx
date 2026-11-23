import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** error text (from zod / the server's VALIDATION_ERROR); always rendered with an icon, never color alone */
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; invalid?: boolean }>;
}

/** Label + control + hint/error, wired with ids so screen readers read them together. */
export function Field({ label, hint, error, required, optional, className, children }: FieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const msgId = `${id}-msg`;
  const control = isValidElement(children)
    ? cloneElement(children, { id: children.props.id ?? id, 'aria-describedby': error || hint ? msgId : undefined, 'aria-invalid': error ? true : undefined, invalid: error ? true : undefined })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={children.props.id ?? id} className="flex items-baseline gap-2 text-sm font-medium text-ink">
        {label}
        {required && <span className="sr-only">({t('ui.required')})</span>}
        {optional && <span className="text-xs font-normal text-ink-3">{t('common.optional')}</span>}
      </label>
      {control}
      {(error || hint) && (
        <p id={msgId} className={cn('flex items-start gap-1.5 text-sm', error ? 'text-danger' : 'text-ink-2')} role={error ? 'alert' : undefined}>
          {error && <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span>{error ?? hint}</span>
        </p>
      )}
    </div>
  );
}

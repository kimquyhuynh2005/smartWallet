import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { controlClass } from './input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options?: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

/** Styled native select: best keyboard, screen-reader and mobile-picker behavior for free. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, invalid, options, placeholder, children, ...p }, ref) => (
  <div className="relative">
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(controlClass, 'appearance-none pr-10', invalid ? 'border-danger' : 'border-control hover:border-ink-2', className)} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
  </div>
));
Select.displayName = 'Select';

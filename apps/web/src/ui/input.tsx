import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const controlClass =
  'w-full min-h-11 rounded-md border bg-sunken px-3 text-base text-ink placeholder:text-ink-3 transition-colors duration-150 ' +
  'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** icon or text inside the field, left / right */
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, leading, trailing, ...p }, ref) => (
  <div className="relative">
    {leading && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">{leading}</span>}
    <input
      ref={ref}
      className={cn(controlClass, invalid ? 'border-danger' : 'border-control hover:border-ink-2', leading && 'pl-10', trailing && 'pr-12', className)}
      aria-invalid={invalid || undefined}
      {...p}
    />
    {trailing && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-2">{trailing}</span>}
  </div>
));
Input.displayName = 'Input';

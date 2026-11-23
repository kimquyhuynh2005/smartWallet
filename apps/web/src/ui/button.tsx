import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Spinner } from './spinner';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:translate-y-px motion-reduce:active:translate-y-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:bg-accent/90',
        secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
        ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
        destructive: 'border border-danger/40 bg-danger-soft text-danger hover:bg-danger/15 disabled:border-danger/30 disabled:bg-danger-soft disabled:opacity-100 disabled:text-danger/70',
      },
      size: { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-base', lg: 'min-h-12 px-5 text-base', icon: 'h-11 w-11' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** shows a spinner, disables the button and sets aria-busy; the label stays so the width does not jump */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, disabled, children, type = 'button', ...p }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...p}>
    {loading && <Spinner className="h-4 w-4" />}
    {children}
  </button>
));
Button.displayName = 'Button';

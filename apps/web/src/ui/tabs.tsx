import * as T from '@radix-ui/react-tabs';
import { forwardRef, useCallback, useEffect, useRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;

/** `underline` = ledger-style tabs for sections; `segmented` = compact switch for 2-4 options. */
export const TabsList = forwardRef<ElementRef<typeof T.List>, ComponentPropsWithoutRef<typeof T.List> & { variant?: 'underline' | 'segmented' }>(({ className, variant = 'underline', ...p }, ref) => (
  <T.List
    ref={ref}
    data-variant={variant}
    className={cn(variant === 'underline' ? 'scroll-hide flex gap-5 overflow-x-auto border-b border-line' : 'inline-flex rounded-md border border-line bg-sunken p-1', className)}
    {...p}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<ElementRef<typeof T.Trigger>, ComponentPropsWithoutRef<typeof T.Trigger>>(({ className, ...p }, ref) => {
  // Pages often filter ONE list with tabs and never mount a TabsContent per trigger: an aria-controls pointing at a
  // panel that does not exist is invalid ARIA, so drop it when the target is missing.
  const own = useRef<HTMLButtonElement | null>(null);
  const setRef = useCallback((el: HTMLButtonElement | null) => { own.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as { current: HTMLButtonElement | null }).current = el; }, [ref]);
  useEffect(() => {
    const el = own.current; const id = el?.getAttribute('aria-controls');
    if (el && id && !document.getElementById(id)) el.removeAttribute('aria-controls');
  });
  return (
  <T.Trigger
    ref={setRef}
    className={cn(
      'min-h-11 whitespace-nowrap text-base font-medium text-ink-2 transition-colors hover:text-ink',
      // underline variant
      'group-data-[variant=underline]:-mb-px',
      '[[data-variant=underline]_&]:-mb-px [[data-variant=underline]_&]:border-b-2 [[data-variant=underline]_&]:border-transparent [[data-variant=underline]_&]:pb-1 [[data-variant=underline]_&]:data-[state=active]:border-accent [[data-variant=underline]_&]:data-[state=active]:text-ink',
      // segmented variant
      '[[data-variant=segmented]_&]:rounded-md [[data-variant=segmented]_&]:px-3 [[data-variant=segmented]_&]:text-sm [[data-variant=segmented]_&]:data-[state=active]:bg-surface [[data-variant=segmented]_&]:data-[state=active]:text-ink [[data-variant=segmented]_&]:data-[state=active]:shadow-[0_0_0_1px_rgb(var(--line))]',
      className,
    )}
    {...p}
  />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<ElementRef<typeof T.Content>, ComponentPropsWithoutRef<typeof T.Content>>(({ className, ...p }, ref) => (
  <T.Content ref={ref} className={cn('pt-4 focus-visible:outline-none', className)} {...p} />
));
TabsContent.displayName = 'TabsContent';

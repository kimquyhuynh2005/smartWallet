import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Hairline border on paper-white surface. No shadow: only floating things (popovers, toasts, dialogs) get one. */
export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-line bg-surface p-4 md:p-5', className)} {...p} />
);
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...p} />;
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn('text-lg font-semibold text-ink', className)} {...p} />;

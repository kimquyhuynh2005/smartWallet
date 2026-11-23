import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Left-aligned, calm, and always points to the next action. One small line icon, never a big illustration. */
export function EmptyState({ icon: Icon, title, children, action, className }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong p-5 md:p-6', className)}>
      {Icon && <Icon className="h-6 w-6 text-ink-3" aria-hidden />}
      <div className="flex max-w-prose flex-col gap-1">
        <p className="text-base font-semibold text-ink">{title}</p>
        {children && <p className="text-sm text-ink-2">{children}</p>}
      </div>
      {action}
    </div>
  );
}

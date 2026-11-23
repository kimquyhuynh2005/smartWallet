import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const badge = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'bg-sunken text-ink-2 border border-line',
      accent: 'bg-accent-soft text-accent',
      warn: 'bg-warn-soft text-warn',
      danger: 'bg-danger-soft text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {
  /** an icon is strongly recommended for warn/danger so the state never relies on color alone */
  icon?: ReactNode;
}

export const Badge = ({ className, tone, icon, children, ...p }: BadgeProps) => (
  <span className={cn(badge({ tone }), className)} {...p}>
    {icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden>{icon}</span>}
    {children}
  </span>
);

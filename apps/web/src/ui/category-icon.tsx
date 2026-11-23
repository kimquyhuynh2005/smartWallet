import { categoryVisual, TRANSFER_VISUAL, type CategoryLike } from '@/lib/categories';
import { cn } from '@/lib/utils';

const SIZE = { sm: 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4', md: 'h-10 w-10 [&>svg]:h-5 [&>svg]:w-5', lg: 'h-12 w-12 [&>svg]:h-6 [&>svg]:w-6' } as const;

/** One icon + one muted hue per category, identical in lists, charts, budgets and forms. Decorative: the name is always printed next to it. */
export function CategoryIcon({ category, transfer, size = 'md', className }: { category?: CategoryLike | null; transfer?: boolean; size?: keyof typeof SIZE; className?: string }) {
  const { Icon, color } = transfer ? TRANSFER_VISUAL : categoryVisual(category);
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-md', SIZE[size], className)} style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <Icon strokeWidth={1.75} />
    </span>
  );
}

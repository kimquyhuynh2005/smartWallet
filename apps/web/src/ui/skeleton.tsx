import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Placeholder block shaped like the content it stands in for (never a spinner over a blank page). */
export const Skeleton = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('skeleton rounded-md', className)} aria-hidden {...p} />;

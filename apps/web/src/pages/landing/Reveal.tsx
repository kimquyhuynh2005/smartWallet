import type { ReactNode } from 'react';
import { useInView, useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

/** Scroll reveal: a 4px rise + fade, once. With prefers-reduced-motion the content is simply there. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(0.12);
  return (
    <div ref={ref} className={cn(className, !reduced && (seen ? 'animate-rise-in' : 'opacity-0'))} style={!reduced && delay ? { animationDelay: `${delay}ms`, animationFillMode: 'backwards' } : undefined}>
      {children}
    </div>
  );
}

export function SectionHead({ eyebrow, title, sub, className, id }: { eyebrow: string; title: string; sub?: string; className?: string; id?: string }) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink md:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-base text-ink-2 md:text-lg">{sub}</p>}
    </div>
  );
}

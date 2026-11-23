import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** required: every overlay has an accessible name */
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const overlay = 'fixed inset-0 z-40 bg-[rgb(var(--scrim))] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out';

function Header({ title, description }: Pick<BaseProps, 'title' | 'description'>) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <D.Title className="text-lg font-semibold text-ink">{title}</D.Title>
        {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
      </div>
      <D.Close className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink" aria-label={t('common.close')}>
        <X className="h-5 w-5" aria-hidden />
      </D.Close>
    </div>
  );
}

/** Centered dialog (desktop). Focus is trapped and restored; Esc and the overlay close it. */
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: BaseProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content onOpenAutoFocus={(e) => { const first = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('input:not([type=hidden]),select,textarea'); if (first) { e.preventDefault(); first.focus(); } }} className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-float data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out', className)}>
          <Header title={title} description={description} />
          <div className="flex flex-col gap-4">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Bottom sheet (mobile): thumb-reachable, slides up, keeps the page visible behind it. Drag the handle or the title down to dismiss. */
export function Sheet({ open, onOpenChange, title, description, children, footer, className }: BaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const move = (dy: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = smooth ? 'transform 200ms ease-out' : 'none';
    el.style.transform = dy ? `translateY(${dy}px)` : '';
  };
  const onDown = (e: RPointerEvent) => { drag.current = { y: e.clientY, t: performance.now(), dy: 0 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: RPointerEvent) => { const d = drag.current; if (!d) return; d.dy = Math.max(0, e.clientY - d.y); move(d.dy, false); };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    const fast = d.dy > 30 && d.dy / Math.max(1, performance.now() - d.t) > 0.6; // px per ms: a flick
    if (d.dy > 80 || fast) { ref.current?.style.setProperty('--sheet-dy', `${d.dy}px`); onOpenChange(false); } // the exit animation continues from where the finger left it
    else move(0, true);
  };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content ref={ref} onOpenAutoFocus={(e) => { const first = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('input:not([type=hidden]),select,textarea'); if (first) { e.preventDefault(); first.focus(); } }} className={cn('fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-xl border border-b-0 border-line bg-surface px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1 shadow-float data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down', className)}>
          <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="-mx-4 flex shrink-0 touch-none cursor-grab justify-center px-4 py-2" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-line-strong" />
          </div>
          <Header title={title} description={description} />
          <div className="flex flex-col gap-4">{children}</div>
          {footer && <div className="flex flex-col gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Sheet below 768 px, Dialog from 768 px up. */
export function ResponsiveDialog(props: BaseProps) {
  const desktop = useIsDesktop();
  return desktop ? <Dialog {...props} /> : <Sheet {...props} />;
}

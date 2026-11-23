import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const Ctx = createContext<{ close: () => void } | null>(null);

interface MenuProps {
  /** accessible name of the trigger button */
  label: string;
  /** visual content of the trigger button */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
  panelClassName?: string;
}

/**
 * Small action menu (avatar menu, row actions). Keyboard: Enter/Space/ArrowDown opens, arrows/Home/End move, Esc closes and returns focus, Tab closes.
 * Outside click closes. Items are `MenuItem`s; anything else inside (a toggle group) must wrap itself in role="none" content.
 */
export function Menu({ label, trigger, children, align = 'end', triggerClassName, panelClassName }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = () => [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const onPanelKey = (e: React.KeyboardEvent) => {
    const list = items(); const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={btn} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        className={cn('flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors hover:bg-sunken', triggerClassName)}
      >{trigger}</button>
      {open && (
        <Ctx.Provider value={{ close: () => close() }}>
          <div id={id} ref={panel} role="menu" aria-label={label} onKeyDown={onPanelKey}
            className={cn('absolute top-full z-50 mt-2 min-w-[14rem] max-w-[calc(100vw-1.5rem)] animate-fade-in rounded-lg border border-line bg-surface p-1.5 shadow-float motion-reduce:animate-none', align === 'end' ? 'right-0' : 'left-0', panelClassName)}>
            {children}
          </div>
        </Ctx.Provider>
      )}
    </div>
  );
}

export function MenuItem({ children, onSelect, icon, danger, className }: { children: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean; className?: string }) {
  const ctx = useContext(Ctx);
  return (
    <button
      type="button" role="menuitem" tabIndex={-1}
      onClick={() => { ctx?.close(); onSelect(); }}
      className={cn('flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-base transition-colors hover:bg-sunken focus-visible:bg-sunken', danger ? 'text-danger' : 'text-ink', className)}
    >
      {icon && <span className="shrink-0 text-ink-2" aria-hidden>{icon}</span>}
      {children}
    </button>
  );
}

export const MenuSeparator = () => <div role="separator" className="my-1.5 h-px bg-line" />;

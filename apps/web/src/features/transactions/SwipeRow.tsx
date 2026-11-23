import { Pencil, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

const THRESHOLD = 72; // px of travel that commits an action
const MAX = 104;

interface Props { children: ReactNode; editLabel: string; deleteLabel: string; onEdit: () => void; onDelete: () => void }

/**
 * Touch gesture layer for a ledger row: drag left = delete, drag right = edit (finger or pen only; a mouse uses the row menu).
 * Purely an accelerator: every action is also reachable through the visible menu button inside `children`.
 * Vertical scrolling is untouched (touch-action: pan-y); with reduced motion the row does not animate back, it just snaps.
 */
export function SwipeRow({ children, editLabel, deleteLabel, onEdit, onDelete }: Props) {
  const reduced = useReducedMotion();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    moved.current = false;
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
    if (!dragging) {
      if (Math.abs(ddy) > 10 && Math.abs(ddy) > Math.abs(ddx)) { start.current = null; return; } // a scroll, not a swipe
      if (Math.abs(ddx) < 10 || Math.abs(ddx) < Math.abs(ddy) * 1.5) return;
      setDragging(true);
      moved.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDx(Math.max(-MAX, Math.min(MAX, ddx)));
  };
  const end = (cancel: boolean) => () => {
    const wasDragging = dragging;
    const final = dx;
    start.current = null;
    setDragging(false);
    setDx(0);
    if (!wasDragging || cancel) return;
    if (final <= -THRESHOLD) onDelete();
    else if (final >= THRESHOLD) onEdit();
  };

  return (
    <li className="relative list-none" style={{ overflow: dx !== 0 ? 'hidden' : 'visible' }}>
      <div aria-hidden className={cn('absolute inset-y-0 left-0 flex w-1/2 items-center gap-2 bg-accent-soft pl-5 text-sm font-medium text-accent', dx <= 0 && 'invisible')}>
        <Pencil className="h-5 w-5" />{editLabel}
      </div>
      <div aria-hidden className={cn('absolute inset-y-0 right-0 flex w-1/2 items-center justify-end gap-2 bg-danger-soft pr-5 text-sm font-medium text-danger', dx >= 0 && 'invisible')}>
        {deleteLabel}<Trash2 className="h-5 w-5" />
      </div>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={end(false)} onPointerCancel={end(true)}
        onClickCapture={(e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
        className={cn('relative bg-surface', !dragging && !reduced && 'transition-transform duration-150 ease-out')}
      >
        {children}
      </div>
    </li>
  );
}

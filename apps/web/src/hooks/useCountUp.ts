import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Eases a displayed number toward `target` (default 320 ms, ease-out) whenever it changes in place.
 * The first render, a changed `enabled`, and reduced-motion users get the final value at once.
 * Returns the value to show; `animating` is true while it differs from the target.
 */
export function useCountUp(target: number, { duration = 320, enabled = true }: { duration?: number; enabled?: boolean } = {}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; from.current = target; return; }
    if (reduced || !enabled || !Number.isFinite(target)) { from.current = target; setShown(target); return; }
    const start = performance.now();
    const origin = from.current;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      const v = p >= 1 ? target : origin + (target - origin) * eased;
      from.current = v;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, enabled, reduced]);

  return { value: shown, animating: shown !== target };
}

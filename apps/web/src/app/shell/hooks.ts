import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUi } from '@/stores/ui';

const editable = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName));
};

/** N opens quick-add from any screen (not while typing, not with modifiers, not on top of another dialog) */
export function useShortcuts() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || editable(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      useUi.getState().openQuickAdd();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

const saved = new Map<string, number>();

/**
 * Each tab (route) keeps its own scroll position: leave /transactions at 900px, come back, you are at 900px; a first visit starts at the top.
 * Restores after the lazy page has actually rendered (polls until the document is tall enough) and gives up if the user scrolls first.
 */
export function useTabScroll() {
  const { pathname } = useLocation();
  const current = useRef(pathname);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const on = () => saved.set(current.current, window.scrollY);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useLayoutEffect(() => {
    current.current = pathname;
    const target = saved.get(pathname) ?? 0;
    if (target === 0) { window.scrollTo(0, 0); return; }
    let frame = 0, raf = 0, cancelled = false;
    const stop = () => { cancelled = true; };
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    const tick = () => {
      if (cancelled) return;
      const tall = document.documentElement.scrollHeight >= target + window.innerHeight;
      if (tall || frame++ > 45) { window.scrollTo(0, target); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); };
  }, [pathname]);
}

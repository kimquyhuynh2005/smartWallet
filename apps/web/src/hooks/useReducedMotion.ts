import { useEffect, useState } from 'react';

/** true when the user asked the OS for less motion: callers must then render the final state with no animation */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false));
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** becomes true once the element has been (at least `threshold` of it) on screen; never goes back */
export function useInView<T extends Element>(threshold = 0.2) {
  const [node, setNode] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!node || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(node);
    return () => io.disconnect();
  }, [node, seen, threshold]);
  return [setNode, seen] as const;
}

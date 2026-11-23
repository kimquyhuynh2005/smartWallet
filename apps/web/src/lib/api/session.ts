import { useSyncExternalStore } from 'react';

/** The access token lives in memory only (never localStorage): a page reload restores it through the httpOnly refresh cookie. */
let token: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const session = {
  get: () => token,
  set(t: string | null) { if (t !== token) { token = t; emit(); } },
  clear() { session.set(null); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};

export const useAccessToken = () => useSyncExternalStore(session.subscribe, session.get, () => null);

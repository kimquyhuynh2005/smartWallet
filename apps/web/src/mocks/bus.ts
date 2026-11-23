type Fn = (payload: any) => void;
const subs = new Map<string, Set<Fn>>();

/** In-memory stand-in for the Socket.IO server while VITE_USE_MOCKS=true: the mock handlers emit, the realtime hook listens. */
export const mockBus = {
  on(userId: string, event: string, fn: Fn) {
    const k = `${userId}:${event}`;
    (subs.get(k) ?? subs.set(k, new Set()).get(k)!).add(fn);
    return () => { subs.get(k)?.delete(fn); };
  },
  emit(userId: string, event: string, payload: unknown) {
    subs.get(`${userId}:${event}`)?.forEach((fn) => setTimeout(() => fn(payload), 30)); // async like a real socket
  },
};

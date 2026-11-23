import { io } from 'socket.io-client';
import { WS_EVENTS, WS_NAMESPACE } from '@smartwallet/shared';
import { mockBus } from '@/mocks/bus';
import { refreshAccessToken } from './api/client';
import { session } from './api/session';
import type { AppNotification, Budget } from './api/endpoints';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'http://localhost:3000';

export interface RealtimeHandlers {
  onNotification: (n: AppNotification) => void;
  onBudget: (b: Budget) => void;
  onStatus?: (connected: boolean) => void;
}

/**
 * Socket.IO /ws with the access token in the handshake (events: notification:new, budget:updated).
 * With VITE_USE_MOCKS=true the same events come from the in-memory bus. The token is read at every (re)connect,
 * and an "unauthorized" handshake triggers ONE silent refresh before retrying.
 */
export function connectRealtime(h: RealtimeHandlers): { close: () => void } {
  if (USE_MOCKS) {
    const m = /^mock\.([^.]+)\./.exec(session.get() ?? '');
    if (!m) return { close() {} };
    const offs = [mockBus.on(m[1], WS_EVENTS.notification, h.onNotification), mockBus.on(m[1], WS_EVENTS.budget, h.onBudget)];
    h.onStatus?.(true);
    return { close: () => offs.forEach((o) => o()) };
  }
  const socket = io(`${WS_URL}${WS_NAMESPACE}`, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: session.get() }),
    reconnectionDelayMax: 10_000,
  });
  socket.on('connect', () => h.onStatus?.(true));
  socket.on('disconnect', () => h.onStatus?.(false));
  socket.on('connect_error', async (e) => {
    if (e.message === 'unauthorized' && (await refreshAccessToken())) socket.connect();
  });
  socket.on(WS_EVENTS.notification, h.onNotification);
  socket.on(WS_EVENTS.budget, h.onBudget);
  return { close: () => { socket.removeAllListeners(); socket.close(); } };
}

/** alerts already shown from a POST /transactions response: the socket must not toast the same one again */
export const seenAlertIds = new Set<string>();

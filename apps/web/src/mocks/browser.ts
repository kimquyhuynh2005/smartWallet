import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { db } from './db';
import { seed } from './seed';

/** Starts the mock API. Called from main.tsx only when VITE_USE_MOCKS=true, so none of this ships in a real build. */
export async function startMocks() {
  seed();
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true, serviceWorker: { url: '/mockServiceWorker.js' } });
  return worker;
}

/** /dev/ui helpers */
export const mockControls = {
  /** every access token issued so far becomes invalid: the next call gets a 401 and must silently refresh */
  expireTokens() { db.invalidBefore = Date.now(); },
  setServerDown(v: boolean) { db.down = v; },
  /** the newest token the mock mailer "sent" to this address: demo mode has no inbox, so the UI offers the link directly */
  lastMailToken(email: string, kind: 'verify' | 'reset'): string | null {
    return [...db.outbox].reverse().find((m) => m.to === email.trim().toLowerCase() && m.kind === kind)?.token ?? null;
  },
};

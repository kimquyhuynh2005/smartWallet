import { expect, type Page } from '@playwright/test';

/**
 * Like helpers.watchErrors but tolerates the browser's own "Failed to load resource ... status of N" line for the
 * HTTP statuses a test provokes on purpose (409 duplicate, 403 unverified, 400 validation...). Everything else still fails the test.
 */
export function watchErrorsExcept(page: Page, expectedStatuses: number[] = []) {
  const errors: string[] = [];
  const allowed = expectedStatuses.length ? new RegExp(`Failed to load resource.*status of (${expectedStatuses.join('|')})`, 'i') : null;
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/favicon|Failed to load resource.*(404|401)/i.test(text)) return;
    if (allowed?.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return { errors, assertNone: () => expect(errors, errors.join('\n')).toEqual([]) };
}

/** Waits until the network is idle-ish so the next assertion does not race a refetch. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
}

/** Real API only: log in over HTTP (through the Vite proxy) to clean up data a test created. */
export async function realApi(page: Page, email = 'demo@smartwallet.local', password = 'Demo@12345') {
  const res = await page.request.post('/api/v1/auth/login', { data: { email, password } });
  expect(res.ok(), 'API login for cleanup').toBeTruthy();
  const token = (await res.json()).data.accessToken as string;
  const headers = { authorization: `Bearer ${token}` };
  return {
    get: async (path: string) => (await (await page.request.get(`/api/v1${path}`, { headers })).json()).data,
    del: async (path: string) => page.request.delete(`/api/v1${path}`, { headers }),
  };
}

/** Parses "1.234.567 ₫" / "-1.234 ₫" / "1,234" into an integer (digits only, minus sign kept). */
export function parseMoney(text: string): number {
  const neg = /^[\s]*[-−–]/.test(text);
  const n = Number(text.replace(/[^\d]/g, ''));
  return neg ? -n : n;
}

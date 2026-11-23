import { expect, type Page, type TestInfo } from '@playwright/test';

/** true in the real-* projects (the local API), false against MSW mocks */
export const isReal = (info: TestInfo) => info.project.name.startsWith('real');
export const isMobile = (info: TestInfo) => info.project.name.endsWith('mobile');

export type Who = 'linh' | 'minh' | 'admin';

/**
 * Seeded logins. Mock: linh (Free, close to the plan limits), minh (Premium), admin.
 * Real API: only the seeded `demo` (Free) and `admin` exist, so `minh` has no real equivalent (tests must skip it).
 */
export function account(who: Who, info: TestInfo): { email: string; password: string } | null {
  if (isReal(info)) {
    if (who === 'minh') return null;
    return who === 'admin' ? { email: 'admin@smartwallet.local', password: 'Admin@12345' } : { email: 'demo@smartwallet.local', password: 'Demo@12345' };
  }
  return { email: `${who}@smartwallet.demo`, password: who === 'admin' ? 'Admin@12345' : 'Demo@12345' };
}

// The real API limits every /auth route to 10 requests/min per IP (CLAUDE.md §6) and each page load also calls /auth/refresh,
// so back-to-back real logins hit 429 and the login form just stays put. Pace real logins; mocks have no limiter.
const REAL_LOGIN_GAP_MS = 30_000;
let lastRealLogin = 0;

/** Log in through the real login form (the mock database resets on every full page load, and the token lives in memory only). */
export async function login(page: Page, who: Who, info: TestInfo, opts: { lang?: 'vi' | 'en'; landing?: RegExp } = {}) {
  const a = account(who, info);
  if (!a) { info.skip(true, `no real-API account for ${who}`); return; }
  if (isReal(info)) {
    const wait = lastRealLogin + REAL_LOGIN_GAP_MS - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    lastRealLogin = Date.now();
  }
  await page.goto(`/login?lang=${opts.lang ?? 'vi'}&theme=light`);
  await page.getByLabel('Email').fill(a.email);
  await page.getByLabel(/^(Mật khẩu|Password)/).first().fill(a.password);
  await page.locator('form').getByRole('button', { name: /^(Đăng nhập|Log in)$/ }).click();
  await expect(page).toHaveURL(opts.landing ?? (who === 'admin' ? /\/admin/ : /\/(dashboard|onboarding)/), { timeout: 20_000 });
}

/** Client-side navigation keeps the in-memory access token (a full page.goto would drop it and, on mocks, reset the data). */
export async function goto(page: Page, path: string) {
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, '\\$&')}`));
}

/** No horizontal scroll (CLAUDE.md: reflow from 360 px). */
export async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, 'page must not scroll horizontally').toBeLessThanOrEqual(cw);
}

/** Collects console errors and uncaught exceptions; call `.assertNone()` at the end of a test. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(404|401)/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { errors, assertNone: () => expect(errors, errors.join('\n')).toEqual([]) };
}

/** Unique, readable test data so repeated runs against the real database never collide. */
export const uniq = (prefix: string) => `${prefix} ${new Date().toISOString().slice(11, 19).replace(/:/g, '')}${Math.floor(Math.random() * 90 + 10)}`;

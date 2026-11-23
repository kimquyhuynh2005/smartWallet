import { expect, type Page, type TestInfo } from '@playwright/test';
import { isReal, login } from './helpers';

/** Like watchErrors, but deliberate 4xx responses (403 PLAN_LIMIT_REACHED, 400 WRONG_PASSWORD) are allowed: Chrome logs every one as a console error. */
export function watchErrorsAllow(page: Page, codes: number[] = [400, 403, 404]) {
  const errors: string[] = [];
  const re = new RegExp(`favicon|Failed to load resource.*status of (${codes.join('|')})`, 'i');
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !re.test(m.text()) && !/Failed to load resource.*(404|401)/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { errors, assertNone: () => expect(errors, errors.join('\n')).toEqual([]) };
}
export const watchErrorsAllow403 = (page: Page) => watchErrorsAllow(page, [403]);

/**
 * Admin login. helpers.ts says the MOCK admin password is Admin@12345 but the mock accepts Demo@12345 (src/mocks/demo.ts),
 * so on the mock we sign in ourselves; on the real API we delegate to the shared helper.
 */
export async function loginAdmin(page: Page, info: TestInfo) {
  if (isReal(info)) return login(page, 'admin', info);
  await page.goto('/login?lang=vi&theme=light');
  await page.getByLabel('Email').fill('admin@smartwallet.demo');
  await page.getByLabel(/^(Mật khẩu|Password)/).first().fill('Demo@12345');
  await page.locator('form').getByRole('button', { name: /^Đăng nhập$/ }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
}

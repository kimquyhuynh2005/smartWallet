import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, login, watchErrors } from './helpers';

test.describe('TC-FE-SMOKE-01 the app boots and a seeded user reaches the dashboard', () => {
  test('landing page renders with no console errors and no horizontal scroll', async ({ page }) => {
    const w = watchErrors(page);
    await page.goto('/?lang=vi');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('login -> dashboard', async ({ page }, info) => {
    const w = watchErrors(page);
    await login(page, 'linh', info);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });
});

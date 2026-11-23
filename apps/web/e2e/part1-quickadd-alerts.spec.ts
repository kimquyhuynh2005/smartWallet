import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalScroll, goto, isMobile, isReal, login, uniq } from './helpers';
import { realApi, settle, watchErrorsExcept } from './part1-helpers';

/** unread count read from the bell's accessible name ("Thông báo, 3 chưa đọc" / "Thông báo") */
async function unreadCount(page: Page): Promise<number> {
  const bell = page.getByRole('link', { name: /^Thông báo/ }).or(page.getByRole('button', { name: /^Thông báo/ })).first();
  await expect(bell).toBeVisible();
  const name = (await bell.getAttribute('aria-label')) ?? '';
  const m = name.match(/(\d+) chưa đọc/);
  return m ? Number(m[1]) : 0;
}

async function openQuickAdd(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.getByRole('navigation', { name: 'Thanh điều hướng dưới' }).getByRole('button', { name: 'Thêm giao dịch' }).click();
  else await page.getByRole('button', { name: /^Thêm giao dịch/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Thêm giao dịch' })).toBeVisible();
}

async function typeAmount(page: Page, info: TestInfo, amount: number) {
  const dlg = page.getByRole('dialog', { name: 'Thêm giao dịch' });
  if (isMobile(info)) {
    // on-screen keypad: digits append, "000" multiplies by 1000
    const thousands = amount / 1000;
    for (const d of String(thousands)) await dlg.getByRole('button', { name: `Phím ${d}`, exact: true }).click();
    await dlg.getByRole('button', { name: 'Phím 000', exact: true }).click();
  } else {
    await dlg.getByRole('textbox').first().fill(String(amount));
  }
}

test.describe('TC-FE-TXN-01 quick add', () => {
  test('TC-FE-TXN-01-01 amount 0 / empty is refused with a message and nothing is saved', async ({ page }, info) => {
    const w = watchErrorsExcept(page);
    await login(page, 'linh', info);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await openQuickAdd(page, info);
    const dlg = page.getByRole('dialog', { name: 'Thêm giao dịch' });
    if (!isMobile(info)) await dlg.getByRole('textbox').first().fill('0');
    await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dlg.getByText('Nhập số tiền lớn hơn 0.')).toBeVisible();
    await expect(dlg).toBeVisible(); // still open
    await expect(page.getByText('Đã lưu giao dịch')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-TXN-01-03 the amount field is exposed to assistive tech with its label "Số tiền"', async ({ page }, info) => {
    await login(page, 'linh', info);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await openQuickAdd(page, info);
    await expect(page.getByRole('dialog', { name: 'Thêm giao dịch' }).getByLabel(/^Số tiền/)).toBeVisible({ timeout: 3000 });
  });

  test('TC-FE-TXN-01-02 the quick-add dialog fits the viewport and the N shortcut opens it on desktop', async ({ page }, info) => {
    test.skip(isMobile(info), 'keyboard shortcut is a desktop feature');
    await login(page, 'linh', info);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog', { name: 'Thêm giao dịch' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('TC-FE-ALR-01 budget alerts after a quick add', () => {
  test('TC-FE-ALR-01-01 an expense crossing 80% raises a toast, increases the bell count and is listed in the notifications', async ({ page }, info) => {
    test.skip(isReal(info), 'covered by TC-FE-ALR-01-03 on the real API (needs a budget the test creates itself)');
    const w = watchErrorsExcept(page);
    await login(page, 'linh', info);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await settle(page);
    const before = await unreadCount(page);

    // Entertainment budget of linh: limit 300.000, seeded at 55% (165.000) -> +100.000 = 88%, crosses 80% only
    await openQuickAdd(page, info);
    const dlg = page.getByRole('dialog', { name: 'Thêm giao dịch' });
    await typeAmount(page, info, 100_000);
    await dlg.getByLabel('Danh mục').selectOption({ label: 'Giải trí' });
    await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();

    // toast in the current language: "Đã dùng 8x% ngân sách Giải trí"
    const toast = page.getByRole('alert').filter({ hasText: /Đã dùng 8\d% ngân sách Giải trí/ });
    await expect(toast.first()).toBeVisible({ timeout: 10_000 });
    await expect(toast.first()).toContainText('Sắp chạm ngân sách');
    await expect(dlg).toBeHidden();

    // bell count increased
    await expect.poll(() => unreadCount(page), { timeout: 10_000 }).toBeGreaterThan(before);

    // and the notification is listed (desktop: bell popover, mobile: /notifications)
    if (isMobile(info)) {
      await page.getByRole('link', { name: /^Thông báo/ }).first().click();
      await expect(page).toHaveURL(/\/notifications/);
    } else {
      await page.getByRole('button', { name: /^Thông báo/ }).click();
      await expect(page.getByRole('dialog', { name: 'Thông báo' })).toBeVisible();
    }
    await expect(page.getByText(/Đã dùng 8\d% ngân sách Giải trí/).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-ALR-01-02 an expense that exceeds 100% raises the over-budget toast (English copy)', async ({ page }, info) => {
    test.skip(isReal(info), 'needs the seeded near-limit budgets of the mock user linh');
    const w = watchErrorsExcept(page);
    await login(page, 'linh', info, { lang: 'en' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await settle(page);
    // Shopping: limit 500.000, seeded 95% (479.000) -> +100.000 = 115%, crosses 100%
    if (isMobile(info)) await page.getByRole('navigation', { name: 'Bottom navigation' }).getByRole('button', { name: 'Add transaction' }).click();
    else await page.getByRole('button', { name: /^Add transaction/ }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Add transaction' });
    await expect(dlg).toBeVisible();
    if (isMobile(info)) {
      for (const d of '100') await dlg.getByRole('button', { name: `Key ${d}`, exact: true }).click();
      await dlg.getByRole('button', { name: 'Key 000', exact: true }).click();
    } else await dlg.getByRole('textbox').first().fill('100000');
    await dlg.getByLabel('Category').selectOption({ label: 'Shopping' });
    await dlg.getByRole('button', { name: 'Save', exact: true }).click();
    const toast = page.getByRole('alert').filter({ hasText: /11\d% of Shopping used/ });
    await expect(toast.first()).toBeVisible({ timeout: 10_000 });
    await expect(toast.first()).toContainText('You are over this budget');
    w.assertNone();
  });

  test('TC-FE-ALR-01-03 real API: an expense crossing 80% of a budget the test created raises the toast and a stored notification (cleans up after itself)', async ({ page }, info) => {
    test.skip(!isReal(info), 'mock counterpart is TC-FE-ALR-01-01');
    const w = watchErrorsExcept(page);
    const note = uniq('E2E canh bao');
    await login(page, 'linh', info); // maps to the real demo user
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    const api = await realApi(page);
    try {
      // 1) own budget: Giải trí, 200.000 for this period (the demo user holds 4 of 5 Free budgets)
      await goto(page, '/budgets');
      await settle(page);
      await page.getByRole('button', { name: 'Thêm ngân sách' }).first().click();
      const bd = page.getByRole('dialog', { name: 'Thêm ngân sách' });
      await bd.getByLabel('Danh mục').selectOption({ label: 'Giải trí' });
      await bd.getByLabel(/^Hạn mức cho kỳ này/).fill('200000');
      await bd.getByRole('button', { name: 'Thêm', exact: true }).click();
      await expect(page.getByText('Đã thêm ngân sách').first()).toBeVisible({ timeout: 10_000 });
      await goto(page, '/dashboard');
      await settle(page);
      const before = await unreadCount(page);

      // 2) expense of 170.000 = 85%
      await openQuickAdd(page, info);
      const dlg = page.getByRole('dialog', { name: 'Thêm giao dịch' });
      await typeAmount(page, info, 170_000);
      await dlg.locator('textarea').fill(note);
      await dlg.getByLabel('Danh mục').selectOption({ label: 'Giải trí' });
      await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
      const toast = page.getByRole('alert').filter({ hasText: /Đã dùng 8\d% ngân sách Giải trí/ });
      await expect(toast.first()).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => unreadCount(page), { timeout: 10_000 }).toBeGreaterThan(before);

      if (isMobile(info)) { await page.getByRole('link', { name: /^Thông báo/ }).first().click(); await expect(page).toHaveURL(/\/notifications/); }
      else { await page.getByRole('button', { name: /^Thông báo/ }).click(); await expect(page.getByRole('dialog', { name: 'Thông báo' })).toBeVisible(); }
      await expect(page.getByText(/Đã dùng 8\d% ngân sách Giải trí/).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      w.assertNone();
    } finally {
      // cleanup: only what this test created (the transaction with the unique note, then the Entertainment budget)
      const txns = await api.get('/transactions?limit=100&sort=-occurredAt').catch(() => []);
      for (const t of (Array.isArray(txns) ? txns : []).filter((x: { note?: string }) => x.note === note)) await api.del(`/transactions/${t.id}`);
      const cats = await api.get('/categories');
      const ent = cats.find((c: { nameEn: string; userId?: string | null }) => c.nameEn === 'Entertainment' && !c.userId)?.id;
      const budgets = await api.get('/budgets');
      for (const b of budgets.filter((x: { categoryId: string | null }) => ent && x.categoryId === ent)) await api.del(`/budgets/${b.id}`);
    }
  });
});

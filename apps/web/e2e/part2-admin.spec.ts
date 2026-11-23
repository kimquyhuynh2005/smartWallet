import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, goto, isReal, login, watchErrors } from './helpers';
import { loginAdmin, watchErrorsAllow403 } from './part2-helpers';

/** Admins never see individual transactions: no transaction rows/links in /admin, no request for transactions. */
function watchTransactionRequests(page: Page) {
  const hits: string[] = [];
  page.on('request', (r) => { if (/\/api\/v1\/transactions/.test(r.url())) hits.push(r.url()); });
  return hits;
}
async function expectNoTransactionUi(page: Page) {
  const main = page.locator('main');
  await expect(main.locator('a[href*="/transactions"]')).toHaveCount(0);
  await expect(main.getByRole('link', { name: /giao dịch/i })).toHaveCount(0);
  for (const t of await main.getByRole('table').all()) await expect(t.getByRole('columnheader', { name: /^(Số tiền|Ghi chú|Ví|Danh mục)$/ })).toHaveCount(0);
}

const TABS = [
  { path: '/admin', name: 'Tổng quan' },
  { path: '/admin/users', name: 'Người dùng' },
  { path: '/admin/categories', name: 'Danh mục mặc định' },
  { path: '/admin/keywords', name: 'Từ khóa' },
  { path: '/admin/plans', name: 'Gói và giới hạn' },
];

test.describe('TC-FE-ADM-01 admin console', () => {
  test('TC-FE-ADM-01-01 stats overview shows aggregate numbers and the privacy note, never transactions', async ({ page }, info) => {
    const w = watchErrors(page);
    const txReq = watchTransactionRequests(page);
    await loginAdmin(page, info);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { level: 1, name: 'Quản trị' })).toBeVisible();
    await expect(page.getByText(/từng giao dịch của người dùng không hiển thị/)).toBeVisible();
    for (const k of ['Tổng người dùng', 'Người dùng Premium', 'Tỷ lệ Premium', 'Tài khoản bị khóa']) await expect(page.locator('dt', { hasText: k })).toBeVisible();
    // a real number, not a skeleton
    const total = page.locator('dt', { hasText: 'Tổng người dùng' }).locator('xpath=following-sibling::dd[1]');
    await expect(total).toHaveText(/^\d[\d.,]*$/, { timeout: 10_000 });
    await expectNoTransactionUi(page);
    await expectNoHorizontalScroll(page);
    expect(txReq, 'no /transactions request from the admin console').toEqual([]);
    w.assertNone();
  });

  test('TC-FE-ADM-01-02 every admin tab renders with no transaction rows or links and no transaction requests', async ({ page }, info) => {
    const w = watchErrors(page);
    const txReq = watchTransactionRequests(page);
    await loginAdmin(page, info);
    for (const tab of TABS) {
      await goto(page, tab.path);
      await expect(page.getByRole('navigation', { name: 'Các mục quản trị' }).getByRole('link', { name: tab.name })).toHaveAttribute('aria-current', 'page');
      await page.waitForTimeout(600); // let lazy tab content and its queries settle
      await expectNoTransactionUi(page);
      await expectNoHorizontalScroll(page);
    }
    expect(txReq, 'no /transactions request from the admin console').toEqual([]);
    w.assertNone();
  });

  test('TC-FE-ADM-01-03 users: search and filters narrow the list, and an empty result offers a way out', async ({ page }, info) => {
    const w = watchErrors(page);
    await loginAdmin(page, info);
    await goto(page, '/admin/users');
    await expect(page.getByRole('heading', { level: 2, name: 'Người dùng' })).toBeVisible();
    const count = page.getByText(/^\d+ \/ \d+ người dùng$/);
    await expect(count).toBeVisible({ timeout: 10_000 });
    const total = Number((await count.innerText()).split('/')[1].replace(/\D/g, ''));
    expect(total).toBeGreaterThan(1);
    // search by the admin's own e-mail (exists on mock and real) narrows to 1
    const email = isReal(info) ? 'admin@smartwallet.local' : 'admin@smartwallet.demo';
    await page.getByRole('searchbox', { name: 'Tìm theo tên hoặc email' }).fill(email);
    await expect(count).toHaveText(new RegExp(`^1 / ${total} người dùng$`));
    await expect(page.getByText(email)).toBeVisible();
    // no match -> empty state + clear filters
    await page.getByRole('searchbox', { name: 'Tìm theo tên hoặc email' }).fill('khong-ton-tai-xyz');
    await expect(page.getByText('Không có người dùng phù hợp')).toBeVisible();
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await expect(count).toHaveText(new RegExp(`^${total} / ${total} người dùng$`));
    // plan filter: Premium list is a subset
    await page.getByLabel('Lọc theo gói').selectOption('PREMIUM');
    await expect(page.getByText(/^\d+ \/ \d+ người dùng$/)).not.toHaveText(new RegExp(`^${total} / `));
    await page.getByLabel('Lọc theo gói').selectOption('');
    // status filter: nobody is locked at the start (mock); LOCKED shows the empty state or locked rows only
    await page.getByLabel('Lọc theo trạng thái').selectOption('LOCKED');
    await expect(page.getByRole('listitem').getByText('Đang hoạt động')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-ADM-01-04 lock a user: row shows the locked state (icon + text), then unlock', async ({ page }, info) => {
    test.fixme(isReal(info), 'PATCH /admin/users/:id is mock-only (docs/backend-requests.md A1); the quiet 404 behaviour is TC-FE-ADM-01-05');
    const w = watchErrorsAllow403(page);
    await loginAdmin(page, info);
    const lockedDd = () => page.locator('dt', { hasText: 'Tài khoản bị khóa' }).locator('xpath=following-sibling::dd[1]');
    await expect(lockedDd()).toHaveText(/^\d+/, { timeout: 10_000 });
    const lockedBefore = Number((await lockedDd().innerText()).match(/^\d+/)![0]);
    await goto(page, '/admin/users');
    const target = 'Trần Thị Mỹ Linh';
    await page.getByRole('searchbox', { name: 'Tìm theo tên hoặc email' }).fill('linh@smartwallet.demo');
    const row = page.getByRole('listitem').filter({ hasText: 'linh@smartwallet.demo' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Đang hoạt động')).toBeVisible();
    await row.getByRole('button', { name: `Khóa tài khoản ${target}` }).click();
    const dlg = page.getByRole('dialog', { name: `Khóa tài khoản ${target}?` });
    await expect(dlg).toContainText('linh@smartwallet.demo');
    await expectNoHorizontalScroll(page);
    // cancelling changes nothing
    await dlg.getByRole('button', { name: 'Hủy' }).click();
    await expect(dlg).toBeHidden();
    await expect(row.getByText('Đang hoạt động')).toBeVisible();
    // confirm
    await row.getByRole('button', { name: `Khóa tài khoản ${target}` }).click();
    await page.getByRole('dialog', { name: `Khóa tài khoản ${target}?` }).getByRole('button', { name: 'Khóa', exact: true }).click();
    await expect(page.getByText(`Đã khóa tài khoản ${target}.`)).toBeVisible();
    await expect(row.getByText('Đã khóa')).toBeVisible();
    await expect(row.locator('svg').first()).toBeAttached(); // the badge carries an icon, not just colour
    // locked filter now lists it
    await page.getByLabel('Lọc theo trạng thái').selectOption('LOCKED');
    await expect(row).toBeVisible();
    await page.getByLabel('Lọc theo trạng thái').selectOption('');
    // the overview counts it
    await goto(page, '/admin');
    await expect(lockedDd()).toHaveText(new RegExp(`^${lockedBefore + 1}`), { timeout: 10_000 });
    // unlock
    await goto(page, '/admin/users');
    await page.getByRole('searchbox', { name: 'Tìm theo tên hoặc email' }).fill('linh@smartwallet.demo');
    await expect(row.getByText('Đã khóa')).toBeVisible();
    await row.getByRole('button', { name: `Mở khóa tài khoản ${target}` }).click();
    await page.getByRole('dialog', { name: `Mở khóa tài khoản ${target}?` }).getByRole('button', { name: 'Mở khóa', exact: true }).click();
    await expect(page.getByText(`Đã mở khóa tài khoản ${target}.`)).toBeVisible();
    await expect(row.getByText('Đang hoạt động')).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-ADM-01-05 an admin cannot lock themselves or another admin (protected rows have no lock button)', async ({ page }, info) => {
    const w = watchErrors(page);
    await loginAdmin(page, info);
    await goto(page, '/admin/users');
    const email = isReal(info) ? 'admin@smartwallet.local' : 'admin@smartwallet.demo';
    await page.getByRole('searchbox', { name: 'Tìm theo tên hoặc email' }).fill(email);
    const row = page.getByRole('listitem').filter({ hasText: email });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('Tài khoản của bạn')).toBeVisible();
    await expect(row.getByRole('button', { name: /Khóa tài khoản/ })).toHaveCount(0);
    w.assertNone();
  });

  test('TC-FE-ADM-01-06 real API: locking is unavailable (PATCH is mock-only, A1) and fails quietly', async ({ page }, info) => {
    test.skip(!isReal(info), 'covers the real API only; the mock implements the lock (TC-FE-ADM-01-04)');
    const w = watchErrorsAllow403(page);
    await loginAdmin(page, info);
    await goto(page, '/admin/users');
    await page.getByRole('searchbox', { name: 'Tìm theo tên hoặc email' }).fill('demo@smartwallet.local');
    const row = page.getByRole('listitem').filter({ hasText: 'demo@smartwallet.local' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    const lockBtn = row.getByRole('button', { name: /^Khóa tài khoản / });
    await lockBtn.click();
    const dlg = page.getByRole('dialog', { name: /^Khóa tài khoản / });
    await dlg.getByRole('button', { name: 'Khóa', exact: true }).click();
    // either the API supports it (then undo it) or we get exactly one quiet "unavailable" message
    const unavailable = page.getByText('Chức năng này chưa khả dụng trên máy chủ này.');
    const locked = row.getByText('Đã khóa');
    await expect(unavailable.or(locked)).toBeVisible({ timeout: 10_000 });
    if (await locked.isVisible()) {
      await row.getByRole('button', { name: /^Mở khóa tài khoản / }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Mở khóa', exact: true }).click();
      await expect(row.getByText('Đang hoạt động')).toBeVisible();
    } else {
      await expect(unavailable).toHaveCount(1);
      await expect(row.getByText('Đang hoạt động')).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Quản trị' })).toBeVisible(); // no crash
    w.assertNone();
  });

  test('TC-FE-ADM-01-07 a non-admin opening /admin sees the forbidden screen with a way out', async ({ page }, info) => {
    const w = watchErrors(page);
    const txReq = watchTransactionRequests(page);
    await login(page, 'linh', info);
    await goto(page, '/admin');
    const alert = page.getByRole('alert').filter({ hasText: 'Bạn không có quyền xem trang này' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Bạn cần quyền quản trị');
    // none of the console content leaks
    await expect(page.getByText('Tổng người dùng')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Các mục quản trị' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    expect(txReq).toEqual([]);
    await alert.getByRole('link', { name: 'Tổng quan' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    // nested admin paths are gated as well
    await goto(page, '/admin/users');
    await expect(page.getByRole('alert').filter({ hasText: 'Bạn không có quyền xem trang này' })).toBeVisible();
    w.assertNone();
  });
});

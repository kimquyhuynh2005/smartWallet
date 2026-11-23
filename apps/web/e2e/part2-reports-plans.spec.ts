import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectNoHorizontalScroll, goto, isMobile, isReal, login, uniq, watchErrors } from './helpers';
import { watchErrorsAllow403 } from './part2-helpers';

/** Toasts are rendered in a live region by the shell; the unavailable/quiet states must not raise one. */
const toastLocator = (page: Page) => page.locator('[data-sonner-toast], [data-toast], li[role="status"][data-state], [aria-live] [role="alert"]').filter({ hasNotText: /^$/ });

async function openReports(page: Page) {
  await goto(page, '/reports');
  await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Chi tiêu theo danh mục' })).toBeVisible();
}

test.describe('TC-FE-RPT-02 reports: category breakdown, trend, daily chart', () => {
  test('TC-FE-RPT-02-01 category breakdown, top notes, daily table render (Free)', async ({ page }, info) => {
    const w = watchErrors(page);
    const failed: string[] = [];
    page.on('response', (r) => { if (r.status() >= 400 && /\/api\/v1\/reports\//.test(r.url())) failed.push(`${r.status()} ${r.url()}`); });
    await login(page, 'linh', info);
    await openReports(page);
    // category breakdown: a list of categories with amounts and percent + a total
    await expect(page.getByText('Tổng chi trong kỳ')).toBeVisible();
    const rows = page.locator('main ol').first().getByRole('listitem');
    await expect(async () => expect(await rows.count()).toBeGreaterThan(0)).toPass();
    await expect(rows.first()).toContainText('%');
    // income toggle changes the section copy
    await page.getByRole('tab', { name: 'Thu nhập' }).click();
    await expect(page.getByText('Tổng thu trong kỳ').or(page.getByText('Kỳ này chưa có khoản thu nào'))).toBeVisible();
    await page.getByRole('tab', { name: 'Chi tiêu' }).click();
    // daily chart has a table alternative (sr-only) with one row per day + cumulative column
    await expect(page.getByRole('heading', { level: 2, name: 'Chi tiêu theo ngày' })).toBeVisible();
    const daily = page.getByRole('table', { name: 'Chi tiêu theo ngày' });
    await expect(daily).toBeAttached();
    expect(await daily.getByRole('row').count()).toBeGreaterThan(28);
    await expect(daily.getByRole('columnheader', { name: 'Đã chi lũy kế' })).toBeAttached();
    if (isReal(info)) {
      // top-notes is mock-only (R1): the real API answers 404 -> quiet note, no toast, no alert
      await expect(page.getByText('Phần này chưa có trên máy chủ này.')).toBeVisible();
      await expect(toastLocator(page)).toHaveCount(0);
      expect(failed.filter((f) => !/top-notes/.test(f)), failed.join('\n')).toEqual([]);
    } else {
      await expect(page.getByRole('heading', { level: 2, name: 'Khoản hay gặp nhất' })).toBeVisible();
      await expect(page.getByText('Phần này chưa có trên máy chủ này.')).toHaveCount(0);
    }
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-RPT-02-02 Premium: 6 and 12 month trend with a table alternative', async ({ page }, info) => {
    test.skip(isReal(info), 'no Premium user on the real API');
    const w = watchErrors(page);
    const trend: string[] = [];
    page.on('request', (r) => { if (/\/api\/v1\/reports\/trend/.test(r.url())) trend.push(new URL(r.url()).searchParams.get('months') ?? ''); });
    await login(page, 'minh', info);
    await openReports(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Thu và chi theo tháng' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '6 tháng' })).toHaveAttribute('aria-selected', 'true');
    await page.getByText('Xem bảng số liệu').click();
    const table = page.getByRole('table', { name: 'Thu và chi theo tháng' });
    await expect(table.getByRole('row')).toHaveCount(7); // header + 6
    await page.getByRole('tab', { name: '12 tháng' }).click();
    await page.getByText('Xem bảng số liệu').click(); // the details element re-mounts closed
    await expect(table.getByRole('row')).toHaveCount(13, { timeout: 10_000 }); // header + 12
    expect(trend).toContain('12');
    await expect(page.getByText('tính năng của gói Premium')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-RPT-02-03 Free: 12 month trend is a locked card and never requests 12 months (no 403)', async ({ page }, info) => {
    const w = watchErrors(page);
    const forbidden: string[] = [];
    const trend: string[] = [];
    page.on('response', (r) => { if (r.status() === 403) forbidden.push(r.url()); });
    page.on('request', (r) => { if (/\/api\/v1\/reports\/trend/.test(r.url())) trend.push(new URL(r.url()).searchParams.get('months') ?? ''); });
    await login(page, 'linh', info);
    await openReports(page);
    await expect(page.getByRole('tab', { name: '6 tháng' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: /12 tháng/ }).click();
    await expect(page.getByText(/Xem xu hướng 12 tháng là tính năng của gói Premium/)).toBeVisible();
    // the locked card offers a way to upgrade and the global dialog did NOT open uninvited
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(trend.filter((m) => m === '12'), 'must not request months=12 as Free').toEqual([]);
    expect(forbidden, forbidden.join('\n')).toEqual([]);
    // back to 6 months renders the chart again
    await page.getByRole('tab', { name: '6 tháng' }).click();
    await expect(page.getByText(/Xem xu hướng 12 tháng/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });
});

test.describe('TC-FE-RPT-03 CSV export (Premium) and its upgrade gate (Free)', () => {
  test('TC-FE-RPT-03-01 Premium export downloads a BOM CSV with a header row and formula-safe cells', async ({ page }, info) => {
    test.skip(isReal(info), 'no Premium user on the real API');
    const w = watchErrors(page);
    await login(page, 'minh', info);
    // a note that would be a spreadsheet formula: add it through the real quick-add form
    await page.getByRole('button', { name: 'Thêm giao dịch' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Thêm giao dịch' });
    await expect(dlg).toBeVisible();
    if (isMobile(info)) {
      // on-screen keypad on small screens: "12" then "000"
      for (const d of '12') await dlg.getByRole('button', { name: `Phím ${d}`, exact: true }).click();
      await dlg.getByRole('button', { name: 'Phím 000', exact: true }).click();
    } else {
      await dlg.getByPlaceholder('0', { exact: true }).fill('12000');
    }
    await dlg.getByRole('textbox', { name: /^Ghi chú/ }).fill('=HYPERLINK("http://x.test")');
    await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
    await openReports(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Xuất CSV' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^smartwallet-.*\.csv$/);
    const path = await download.path();
    const text = await readFile(path!, 'utf8');
    const lines = text.replace(/^﻿/, '').split(/\r\n/).filter(Boolean);
    expect(lines[0]).toBe('date,type,amount,wallet,to_wallet,category,note,source');
    expect(lines.length).toBeGreaterThan(5);
    const formulaRow = lines.find((l) => l.includes('HYPERLINK'));
    expect(formulaRow, 'the transaction we just added is exported').toBeTruthy();
    expect(formulaRow).toContain(`"'=HYPERLINK`); // prefixed with ' (CLAUDE.md formula safety)
    // every cell that would start with = + - @ is prefixed: parse naively on quoted/unquoted cells
    for (const l of lines.slice(1)) {
      const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '')) ?? [];
      for (const c of cells.filter((x) => x !== '')) {
        if (/^[=+\-@]/.test(c)) {
          // a negative amount would be allowed only for numeric cells; amounts are always > 0 so any hit is a leak
          throw new Error(`unsafe CSV cell: ${c}`);
        }
      }
    }
    await expect(page.getByText('Đã tải tệp CSV')).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-RPT-03-03 the downloaded file starts with a UTF-8 BOM (Excel opens Vietnamese text correctly)', async ({ page }, info) => {
    test.skip(isReal(info), 'no Premium user on the real API');
    await login(page, 'minh', info);
    await openReports(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Xuất CSV' }).click()]);
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  test('TC-FE-RPT-03-02 Free: export opens the upgrade dialog and fires no export request', async ({ page }, info) => {
    const w = watchErrorsAllow403(page);
    const exportReq: string[] = [];
    page.on('request', (r) => { if (/\/api\/v1\/reports\/export/.test(r.url())) exportReq.push(r.url()); });
    await login(page, 'linh', info);
    await openReports(page);
    await page.getByRole('button', { name: 'Xuất CSV' }).click();
    const dlg = page.getByRole('dialog', { name: 'Tính năng của Premium' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Xuất báo cáo ra tệp CSV có trong gói Premium');
    await expect(dlg.getByRole('link', { name: 'Xem các gói' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await dlg.getByRole('button', { name: 'Để sau' }).click();
    await expect(dlg).toBeHidden();
    expect(exportReq, 'Free must not call /reports/export').toEqual([]);
    w.assertNone();
  });
});

test.describe('TC-FE-SUB-01 plan limit -> upgrade -> checkout -> cancel', () => {
  test('TC-FE-SUB-01-01 Free limit: adding a wallet beyond the plan opens the upgrade dialog, form not stacked', async ({ page }, info) => {
    const w = watchErrorsAllow403(page);
    await login(page, 'linh', info);
    await goto(page, '/wallets');
    await expect(page.getByRole('heading', { level: 1, name: 'Ví' })).toBeVisible();
    const created: string[] = [];
    const add = async () => {
      const name = uniq('E2E');
      await page.getByRole('button', { name: 'Thêm ví' }).first().click();
      const form = page.getByRole('dialog', { name: 'Thêm ví' });
      await form.getByLabel(/^Tên ví/).fill(name);
      await form.getByRole('button', { name: 'Lưu', exact: true }).click();
      return { name, form };
    };
    try {
      let limitHit = false;
      for (let i = 0; i < 6 && !limitHit; i++) {
        const { name, form } = await add();
        const upgrade = page.getByRole('dialog', { name: 'Tính năng của Premium' });
        await expect(upgrade.or(page.getByText(`Đã tạo ví ${name}`))).toBeVisible({ timeout: 10_000 });
        if (await upgrade.isVisible()) {
          limitHit = true;
          await expect(upgrade).toContainText('ví của gói Miễn phí');
          // the wallet form must not stay stacked behind the global dialog
          await expect(page.getByRole('dialog', { name: 'Thêm ví' })).toHaveCount(0);
          await expect(upgrade.getByRole('link', { name: 'Xem các gói' })).toBeVisible();
          await expectNoHorizontalScroll(page);
          await upgrade.getByRole('button', { name: 'Để sau' }).click();
          await expect(upgrade).toBeHidden();
        } else {
          created.push(name);
          await expect(page.getByText(`Đã tạo ví ${name}`)).toBeVisible();
          await expect(form).toBeHidden();
        }
      }
      expect(limitHit, 'the Free plan limit (403 PLAN_LIMIT_REACHED) must be reached').toBe(true);
      if (!isReal(info)) expect(created.length, 'mock linh already has 3 wallets in the seed, so the 4th is refused').toBeLessThanOrEqual(1);
    } finally {
      // delete ONLY the wallets this test created (the real demo account is shared)
      for (const name of created) {
        await page.getByRole('button', { name: `Thao tác với ví ${name}` }).click();
        await page.getByRole('menuitem', { name: 'Xóa ví' }).click();
        const del = page.getByRole('dialog', { name: `Xóa ví ${name}?` });
        await del.getByRole('button', { name: 'Xóa ví và giao dịch' }).click();
        await expect(del).toBeHidden({ timeout: 10_000 });
      }
    }
    w.assertNone();
  });

  test('TC-FE-SUB-01-02 /plans compares Free vs Premium, mock checkout makes the user Premium, cancel returns to Free', async ({ page }, info) => {
    test.skip(isReal(info), 'subscriptions/me, mock-checkout and cancel are mock-only (docs/backend-requests.md #1, S3)');
    const w = watchErrorsAllow403(page);
    await login(page, 'linh', info);
    // reach /plans through the limit dialog link
    await goto(page, '/wallets');
    await page.getByRole('button', { name: 'Thêm ví' }).first().click();
    const form = page.getByRole('dialog', { name: 'Thêm ví' });
    await form.getByLabel(/^Tên ví/).fill(uniq('E2E'));
    await form.getByRole('button', { name: 'Lưu', exact: true }).click();
    const upgrade = page.getByRole('dialog', { name: 'Tính năng của Premium' });
    await expect(upgrade).toBeVisible({ timeout: 10_000 });
    await upgrade.getByRole('link', { name: 'Xem các gói' }).click();
    await expect(page).toHaveURL(/\/plans/);
    await expect(upgrade).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Gói dịch vụ' })).toBeVisible();
    // Free vs Premium comparison table
    const cmp = page.getByRole('table', { name: 'So sánh hai gói' });
    await expect(cmp.getByRole('columnheader', { name: /Miễn phí/ })).toBeVisible();
    await expect(cmp.getByRole('columnheader', { name: /Premium/ })).toBeVisible();
    await expect(cmp.getByRole('row', { name: /Ví/ }).first()).toContainText('Không giới hạn');
    await expect(page.getByText('Bạn đang dùng gói Miễn phí.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    // checkout
    await page.getByRole('button', { name: 'Nâng cấp Premium' }).click();
    const checkout = page.getByRole('dialog', { name: 'Nâng cấp lên Premium' });
    await expect(checkout).toContainText('không thu tiền thật');
    await checkout.getByRole('button', { name: 'Xác nhận dùng thử' }).click();
    await expect(page.getByText('Bạn đang dùng gói Premium.')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main').getByText('Gói hiện tại').first()).toBeVisible();
    // the settings page shows the Premium badge too
    await goto(page, '/settings');
    await expect(page.getByText('Bạn đang dùng Premium: không giới hạn ví, ngân sách và mục tiêu.')).toBeVisible();
    await goto(page, '/plans');
    // cancel: "keep" does nothing, "confirm" goes back to Free
    await page.getByRole('button', { name: 'Hủy Premium' }).click();
    const cancel = page.getByRole('dialog', { name: 'Hủy Premium?' });
    await cancel.getByRole('button', { name: 'Giữ Premium' }).click();
    await expect(page.getByText('Bạn đang dùng gói Premium.')).toBeVisible();
    await page.getByRole('button', { name: 'Hủy Premium' }).click();
    await page.getByRole('dialog', { name: 'Hủy Premium?' }).getByRole('button', { name: 'Đúng, hủy Premium' }).click();
    await expect(page.getByText('Bạn đang dùng gói Miễn phí.')).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-SUB-01-03 upgrading from the limit dialog itself makes the account Premium', async ({ page }, info) => {
    test.skip(isReal(info), 'mock-checkout is mock-only (docs/backend-requests.md #1)');
    const w = watchErrorsAllow403(page);
    await login(page, 'linh', info);
    await goto(page, '/reports');
    await page.getByRole('button', { name: 'Xuất CSV' }).click();
    const upgrade = page.getByRole('dialog', { name: 'Tính năng của Premium' });
    await upgrade.getByRole('button', { name: 'Nâng cấp Premium' }).click();
    await expect(page.getByText('Bạn đang dùng Premium')).toBeVisible({ timeout: 10_000 });
    await expect(upgrade).toBeHidden();
    // the 12 month trend is now unlocked
    await page.getByRole('tab', { name: /12 tháng/ }).click();
    await expect(page.getByText(/Xem xu hướng 12 tháng là tính năng/)).toHaveCount(0);
    w.assertNone();
  });
});

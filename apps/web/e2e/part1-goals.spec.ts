import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, goto, isMobile, isReal, login, uniq } from './helpers';
import { parseMoney, settle, watchErrorsExcept } from './part1-helpers';

const TARGET = 3_000_000;

/** yyyy-mm-dd, `months` ahead (local calendar day) */
function inMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function openGoals(page: Page, who: 'linh' | 'minh', info: Parameters<typeof login>[2]) {
  await login(page, who, info);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await goto(page, '/goals');
  await expect(page.getByRole('heading', { name: 'Mục tiêu', level: 1 })).toBeVisible();
  await settle(page);
}

async function createGoal(page: Page, name: string, target: number, deadline: string | null) {
  await page.getByRole('button', { name: 'Thêm mục tiêu' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Mục tiêu mới' });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel(/^Tên mục tiêu/).fill(name);
  await dlg.getByRole('textbox').nth(1).fill(String(target)); // amount: the label is not wired to the input (see TC-FE-GOAL-01-04)
  if (deadline) await dlg.getByLabel(/^Hạn hoàn thành/).fill(deadline);
  await dlg.getByRole('button', { name: 'Tạo mục tiêu' }).click();
  await expect(dlg).toBeHidden({ timeout: 10_000 });
  return page.getByRole('link', { name: `Xem chi tiết ${name}` });
}

/** the card of one goal (the list item that holds its link) */
const card = (page: Page, name: string) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name: `Xem chi tiết ${name}` }) });

async function amountAfter(scope: ReturnType<Page['locator']>, label: string): Promise<number> {
  const text = await scope.innerText();
  const m = text.match(new RegExp(`${label}\\s*\\n+\\s*([\\d.]+)`));
  expect(m, `"${label}" figure`).toBeTruthy();
  return parseMoney(m![1]);
}

test.describe('TC-FE-GOAL-01 create a goal', () => {
  test('TC-FE-GOAL-01-01 empty name and empty target are refused with messages', async ({ page }, info) => {
    const w = watchErrorsExcept(page);
    await openGoals(page, 'minh', info);
    await page.getByRole('button', { name: 'Thêm mục tiêu' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Mục tiêu mới' });
    await dlg.getByRole('button', { name: 'Tạo mục tiêu' }).click();
    await expect(dlg.getByText('Bạn đặt tên cho mục tiêu nhé.')).toBeVisible();
    await expect(dlg.getByText('Nhập số tiền lớn hơn 0.')).toBeVisible();
    await expect(dlg).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-GOAL-01-02 the Free plan cap (2 active goals) opens the upgrade dialog instead of creating a third goal', async ({ page }, info) => {
    test.skip(isReal(info), 'depends on how many goals the shared real demo user holds; plan caps are covered by the API suite');
    const w = watchErrorsExcept(page, [403]);
    await openGoals(page, 'linh', info);
    await page.getByRole('button', { name: 'Thêm mục tiêu' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Mục tiêu mới' });
    await dlg.getByLabel(/^Tên mục tiêu/).fill(uniq('Mục tiêu thứ ba'));
    await dlg.getByRole('textbox').nth(1).fill('1000000');
    await dlg.getByRole('button', { name: 'Tạo mục tiêu' }).click();
    await expect(page.getByText(/2\/2 mục tiêu của gói Miễn phí/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Nâng cấp Premium' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-GOAL-01-04 the target amount field is exposed to assistive tech with its label', async ({ page }, info) => {
    await openGoals(page, 'minh', info);
    await page.getByRole('button', { name: 'Thêm mục tiêu' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Mục tiêu mới' }).getByLabel(/^Số tiền cần đạt/)).toBeVisible({ timeout: 3000 });
  });
});

test.describe('TC-FE-GOAL-02 contributions, progress and achievement', () => {
  test('TC-FE-GOAL-02-01 create -> contribute -> progress + required-per-month update -> contribute the rest -> ACHIEVED with the calm goal-reached moment', async ({ page }, info) => {
    test.skip(isReal(info), 'contributions endpoint is mock-only (docs/backend-requests.md #2); real behaviour is TC-FE-GOAL-02-03');
    const w = watchErrorsExcept(page);
    const name = uniq('Mua laptop');
    await openGoals(page, 'minh', info);
    await createGoal(page, name, TARGET, inMonths(3));

    const c = card(page, name);
    await expect(c).toBeVisible();
    await expect(c.getByText('Đang góp')).toBeVisible();
    expect(await amountAfter(c, 'Đã góp')).toBe(0);
    expect(await amountAfter(c, 'Mục tiêu')).toBe(TARGET);
    await expect(c.getByText(/Cần góp mỗi tháng/)).toBeVisible();
    const perMonth0 = parseMoney((await c.innerText()).match(/Cần góp mỗi tháng\s*\n*\s*([\d.]+)/)![1]);
    expect(perMonth0).toBeGreaterThan(0);
    expect(perMonth0).toBeLessThanOrEqual(TARGET);
    await expectNoHorizontalScroll(page);

    // contribute 1.000.000
    await c.getByRole('button', { name: 'Góp / rút' }).click();
    const dlg = page.getByRole('dialog', { name: 'Góp / rút tiền' });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel(/^Số tiền/).fill('1000000');
    await dlg.getByRole('button', { name: 'Góp vào mục tiêu' }).click();
    await expect(page.getByText('Đã góp vào mục tiêu').first()).toBeVisible();
    await expect(dlg).toBeHidden();

    await expect.poll(async () => amountAfter(card(page, name), 'Đã góp')).toBe(1_000_000);
    await expect(card(page, name).getByRole('progressbar', { name: `Tiến độ ${name}` })).toHaveAttribute('aria-valuenow', '33');
    const perMonth1 = parseMoney((await card(page, name).innerText()).match(/Cần góp mỗi tháng\s*\n*\s*([\d.]+)/)![1]);
    expect(perMonth1, 'required per month shrinks after a contribution').toBeLessThan(perMonth0);

    // still ACTIVE, no celebration yet
    await expect(card(page, name).getByText('Đang góp')).toBeVisible();
    await expect(page.getByText(/Bạn đã đạt mục tiêu/)).toHaveCount(0);

    // contribute the rest -> ACHIEVED + celebration
    await card(page, name).getByRole('button', { name: 'Góp / rút' }).click();
    await dlg.getByLabel(/^Số tiền/).fill(String(TARGET - 1_000_000));
    await dlg.getByRole('button', { name: 'Góp vào mục tiêu' }).click();
    await expect(page.getByText(`Bạn đã đạt mục tiêu “${name}”!`)).toBeVisible({ timeout: 10_000 });
    await expect(card(page, name).getByText('Đã đạt')).toBeVisible();
    await expect(card(page, name).getByText(/Cần góp mỗi tháng/)).toHaveCount(0);
    expect(await amountAfter(card(page, name), 'Đã góp')).toBe(TARGET);
    await page.getByRole('button', { name: 'Đóng lời chúc' }).click();
    await expect(page.getByText(/Bạn đã đạt mục tiêu/)).toHaveCount(0);

    // the detail page shows the history of both contributions
    await card(page, name).getByRole('link', { name: `Xem chi tiết ${name}` }).click();
    await expect(page).toHaveURL(/\/goals\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Lịch sử góp' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Góp' })).toHaveCount(2);
    await expect(page.getByText(/Mục tiêu đã đạt vì/)).toBeVisible();
    w.assertNone();
  });

  test('TC-FE-GOAL-02-04 the detail page of an ACHIEVED goal (celebration + info alert) reflows at 360 px', async ({ page }, info) => {
    test.skip(isReal(info), 'contributions are mock-only');
    const name = uniq('Mua xe');
    await openGoals(page, 'minh', info);
    await createGoal(page, name, TARGET, null);
    await page.getByRole('link', { name: `Xem chi tiết ${name}` }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Góp / rút' }).click();
    const dlg = page.getByRole('dialog', { name: 'Góp / rút tiền' });
    await dlg.getByLabel(/^Số tiền/).fill(String(TARGET));
    await dlg.getByRole('button', { name: 'Góp vào mục tiêu' }).click();
    await expect(page.getByText(/Mục tiêu đã đạt vì/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Bạn đã đạt mục tiêu “${name}”!`)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('TC-FE-GOAL-02-02 contribution errors: empty amount and withdrawing more than saved are refused', async ({ page }, info) => {
    test.skip(isReal(info), 'contributions endpoint is mock-only (docs/backend-requests.md #2)');
    const w = watchErrorsExcept(page);
    await openGoals(page, 'minh', info);
    const c = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Xem chi tiết Mua laptop mới' }) });
    await c.getByRole('button', { name: 'Góp / rút' }).click();
    const dlg = page.getByRole('dialog', { name: 'Góp / rút tiền' });
    await dlg.getByRole('button', { name: 'Góp vào mục tiêu' }).click();
    await expect(dlg.getByText('Nhập số tiền lớn hơn 0.')).toBeVisible();

    await dlg.getByRole('tab', { name: 'Rút ra' }).click();
    await dlg.getByLabel(/^Số tiền/).fill('999999999');
    await expect(dlg.getByText('Bạn chỉ rút được tối đa số đã góp.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Rút khỏi mục tiêu' }).click();
    await expect(dlg).toBeVisible();
    await expect(page.getByText('Đã rút khỏi mục tiêu')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-GOAL-02-03 real API: a goal can be created, shows the quiet "no contribution history" state, and is deleted again', async ({ page }, info) => {
    test.skip(!isReal(info), 'mock-only counterpart is TC-FE-GOAL-02-01');
    const w = watchErrorsExcept(page, [404]);
    const name = uniq('E2E mục tiêu');
    await openGoals(page, 'linh', info); // real demo user (Free)
    await createGoal(page, name, TARGET, inMonths(6));
    const c = card(page, name);
    await expect(c).toBeVisible();
    await expect(c.getByText('Đang góp')).toBeVisible();
    await expect(c.getByText(/Cần góp mỗi tháng/)).toBeVisible();
    await c.getByRole('link', { name: `Xem chi tiết ${name}` }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Chưa có lịch sử góp')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // clean up: delete only the goal this test created
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xóa mục tiêu' }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole('link', { name: `Xem chi tiết ${name}` })).toHaveCount(0);
    w.assertNone();
  });
});

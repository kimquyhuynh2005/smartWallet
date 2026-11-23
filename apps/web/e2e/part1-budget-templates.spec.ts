import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, goto, isReal, login } from './helpers';
import { parseMoney, settle, watchErrorsExcept } from './part1-helpers';

const INCOME = 10_000_000;

async function openTemplates(page: Page, who: 'linh' | 'minh', info: Parameters<typeof login>[2]) {
  await login(page, who, info);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await goto(page, '/budgets');
  await expect(page.getByRole('heading', { name: 'Ngân sách', level: 1 })).toBeVisible();
  await settle(page);
  await page.getByRole('button', { name: 'Dùng mẫu' }).click();
  const dlg = page.getByRole('dialog', { name: 'Chọn mẫu ngân sách' });
  await expect(dlg).toBeVisible();
  return dlg;
}

/** reads the two headline figures of the preview ("Tổng ngân sách" and "Để dành tiết kiệm") */
async function previewFigures(dlg: ReturnType<Page['getByRole']>) {
  const text = await dlg.innerText();
  const total = text.match(/Tổng ngân sách\s*\n+\s*([\d.]+)/)?.[1];
  const reserved = text.match(/Để dành tiết kiệm\s*\n+\s*([\d.]+)/)?.[1];
  expect(total, 'preview total').toBeTruthy();
  expect(reserved, 'preview reserved').toBeTruthy();
  return { total: parseMoney(total!), reserved: parseMoney(reserved!), text };
}

test.describe('TC-FE-BUD-02 budget templates', () => {
  test('TC-FE-BUD-02-01 50/30/20 preview splits the income exactly (budgets + savings = income) and Free plan truncation is explained', async ({ page }, info) => {
    const w = watchErrorsExcept(page);
    const dlg = await openTemplates(page, 'linh', info);
    await dlg.getByRole('radio', { name: '50/30/20' }).click();
    await dlg.getByRole('textbox').first().fill(String(INCOME));
    await expectNoHorizontalScroll(page);
    await dlg.getByRole('button', { name: 'Xem trước' }).click();
    await expect(dlg.getByText('Bạn sẽ có').or(dlg.getByText('Tổng ngân sách').first())).toBeVisible();

    const { total, reserved, text } = await previewFigures(dlg);
    expect(total).toBe(8_000_000); // needs 50% + wants 30%
    expect(reserved).toBe(2_000_000); // savings 20%
    expect(total + reserved).toBe(INCOME);
    expect(text).toMatch(/Thiết yếu · 50%/);
    expect(text).toMatch(/Mong muốn · 30%/);

    // every shown category row adds up to the group totals, so the rows add up to the total
    const rowSum = await dlg.locator('section ul li').evaluateAll((lis) => lis.reduce((a, li) => {
      const m = (li as HTMLElement).innerText.match(/([\d.]+)\s*₫\s*$/m);
      return a + (m ? Number(m[1].replace(/\./g, '')) : 0);
    }, 0));
    expect(rowSum, 'category rows must add up to the budget total (largest remainder)').toBe(total);

    // Free plan: truncation notice (linh already holds 5 budgets)
    await expect(dlg.getByText(/Gói Miễn phí tối đa 5 ngân sách/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-BUD-02-02 applying the template on the Free plan respects the budget cap and reports what was skipped', async ({ page }, info) => {
    test.skip(isReal(info), 'mutates the shared real database (budgets cannot be restored through the UI without data loss); preview and validation tests cover the real API');
    const w = watchErrorsExcept(page);
    const dlg = await openTemplates(page, 'linh', info);
    await dlg.getByRole('radio', { name: '50/30/20' }).click();
    await dlg.getByRole('textbox').first().fill(String(INCOME));
    await dlg.getByRole('button', { name: 'Xem trước' }).click();
    await dlg.getByRole('button', { name: 'Áp dụng cho kỳ này' }).click();
    const done = page.getByRole('dialog', { name: 'Đã áp dụng mẫu' }); // the dialog is renamed once applied
    await expect(done).toBeVisible({ timeout: 10_000 });
    await expect(done.getByText(/Bỏ qua do giới hạn gói: [1-9]/)).toBeVisible();
    await expect(done.getByText('Tạo mới: 0')).toBeVisible();
    await done.getByRole('button', { name: 'Xong' }).click();
    // never more than max_budgets (5) budget cards: total + at most 4 categories
    await settle(page);
    const cards = await page.locator('main').getByRole('link', { name: /xem giao dịch$/ }).count();
    expect(cards).toBeLessThanOrEqual(4);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-BUD-02-03 6 jars preview sums to the income', async ({ page }, info) => {
    const w = watchErrorsExcept(page);
    const dlg = await openTemplates(page, 'linh', info);
    await dlg.getByRole('radio', { name: '6 hũ' }).click();
    await dlg.getByRole('textbox').first().fill(String(INCOME));
    await dlg.getByRole('button', { name: 'Xem trước' }).click();
    const { total, reserved, text } = await previewFigures(dlg);
    expect(total + reserved).toBe(INCOME);
    expect(text).toMatch(/Thiết yếu · 55%/);
    expect(text).toMatch(/Học tập · 10%/);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-BUD-02-04 custom percentages must total exactly 100, otherwise the preview is blocked', async ({ page }, info) => {
    const w = watchErrorsExcept(page);
    const dlg = await openTemplates(page, 'linh', info);
    await dlg.getByRole('radio', { name: 'Tự chia' }).click();
    await dlg.getByRole('textbox').first().fill(String(INCOME));
    await expect(dlg.getByText('Đủ 100%')).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Xem trước' })).toBeEnabled();

    const pct = dlg.getByLabel('Tỷ lệ (%)').first();
    const old = Number(await pct.inputValue());
    await pct.fill(String(old + 7));
    await expect(dlg.getByText('Đang dư 7%')).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Xem trước' })).toBeDisabled();

    await pct.fill(String(Math.max(1, old - 5)));
    await expect(dlg.getByText(/Còn thiếu \d+%/)).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Xem trước' })).toBeDisabled();

    await pct.fill(String(old));
    await expect(dlg.getByText('Đủ 100%')).toBeVisible();
    await dlg.getByRole('button', { name: 'Xem trước' }).click();
    const { total, reserved } = await previewFigures(dlg);
    expect(total + reserved).toBe(INCOME);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-BUD-02-05 missing income is refused', async ({ page }, info) => {
    const w = watchErrorsExcept(page);
    const dlg = await openTemplates(page, 'linh', info);
    await dlg.getByRole('button', { name: 'Xem trước' }).click();
    await expect(dlg.getByText('Nhập thu nhập lớn hơn 0.')).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Áp dụng cho kỳ này' })).toHaveCount(0);
    w.assertNone();
  });

  test('TC-FE-BUD-02-06 applying a template on Premium creates budgets that show on the page', async ({ page }, info) => {
    test.skip(isReal(info), 'no Premium user on the real API');
    const w = watchErrorsExcept(page);
    const dlg = await openTemplates(page, 'minh', info);
    await dlg.getByRole('radio', { name: '6 hũ' }).click();
    await dlg.getByRole('textbox').first().fill(String(INCOME));
    await dlg.getByRole('button', { name: 'Xem trước' }).click();
    await expect(dlg.getByText(/Gói Miễn phí tối đa/)).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Áp dụng cho kỳ này' }).click();
    const done = page.getByRole('dialog', { name: 'Đã áp dụng mẫu' });
    await expect(done).toBeVisible({ timeout: 10_000 });
    await expect(done.getByText(/Tạo mới: [1-9]/)).toBeVisible();
    await done.getByRole('button', { name: 'Xong' }).click();
    await settle(page);
    await expect(page.locator('main').getByRole('link', { name: 'Nhà ở, xem giao dịch' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });
});

import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, goto, isMobile, isReal, uniq } from './helpers';
import { watchErrorsExcept } from './part1-helpers';

const PASSWORD = 'Demo@12345';

async function fillRegister(page: Page, name: string, email: string, password: string) {
  await page.goto('/register?lang=vi&theme=light');
  await page.getByLabel(/Họ và tên/).fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Mật khẩu/).first().fill(password);
}

test.describe('TC-FE-AUTH-01 register', () => {
  test('TC-FE-AUTH-01-01 invalid email and weak password are refused with messages, nothing is submitted', async ({ page }) => {
    const w = watchErrorsExcept(page);
    await page.goto('/register?lang=vi&theme=light');
    await page.getByLabel(/Họ và tên/).fill('Test User');
    await page.getByLabel('Email').fill('khong-phai-email');
    await page.getByLabel(/^Mật khẩu/).first().fill('abc');
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByText('Email chưa đúng định dạng')).toBeVisible();
    await expect(page.getByText('Mật khẩu cần ít nhất 8 ký tự, có chữ và số')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-AUTH-01-02 empty name is refused', async ({ page }) => {
    await page.goto('/register?lang=vi&theme=light');
    await page.getByLabel('Email').fill('a@b.vn');
    await page.getByLabel(/^Mật khẩu/).first().fill(PASSWORD);
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByText('Bạn nhập họ tên nhé')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('TC-FE-AUTH-01-03 duplicate email shows the "already has an account" message with login / reset links', async ({ page }, info) => {
    const w = watchErrorsExcept(page, [409]);
    const email = isReal(info) ? 'demo@smartwallet.local' : 'linh@smartwallet.demo';
    await fillRegister(page, 'Trùng Email', email, PASSWORD);
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByText('Email này đã có tài khoản. Bạn đăng nhập hoặc đặt lại mật khẩu nhé.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập' }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });
});

test('TC-FE-AUTH-01-04 the check-email page reflows at 360 px with a long (31 character) address', async ({ page }, info) => {
  test.skip(isReal(info), 'layout check, identical on the real API; mock run is enough');
  const email = 'nguoi.dung.123456.78@example.vn';
  await fillRegister(page, 'Dài Email', email, PASSWORD);
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kiểm tra email của bạn' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test.describe('TC-FE-USER-02 register -> verify -> login -> onboarding wizard -> dashboard', () => {
  test('TC-FE-USER-02-01 a new user completes the wizard and lands on the dashboard with the new wallet', async ({ page }, info) => {
    test.fixme(isReal(info), 'Real API: login is blocked until the email is verified and the console MAIL_TRANSPORT only logs the link (the DemoMailLink exists only in mock builds), so the wizard cannot be reached from a fresh registration.');
    const w = watchErrorsExcept(page, [403]);
    const email = `${uniq('nguoi dung').replace(/ /g, '.')}@example.vn`;
    const walletName = 'Ví test e2e';

    // register -> check-email
    await fillRegister(page, 'Nguyễn Test', email, PASSWORD);
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kiểm tra email của bạn' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: email })).toBeVisible();

    // login before verifying is refused
    // (client-side navigation: a full load would reset the mock database and drop the new user)
    await goto(page, '/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Mật khẩu/).first().fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByText(/chưa được xác thực/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // go back to check-email (browser back keeps state) and open the demo verification link
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Kiểm tra email của bạn' })).toBeVisible();
    await page.getByRole('button', { name: /Mở liên kết xác thực/ }).click();
    await expect(page.getByRole('heading', { name: 'Email đã được xác thực' })).toBeVisible();

    // login -> onboarding
    await goto(page, '/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Mật khẩu/).first().fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

    // step 1 name
    await expect(page.getByRole('heading', { name: 'Mình gọi bạn là gì?' })).toBeVisible();
    await expect(page.getByText('Bước 1/4')).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // step 2 income: error path first
    await expect(page.getByRole('heading', { name: 'Thu nhập hàng tháng của bạn' })).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByText('Bạn nhập thu nhập lớn hơn 0 nhé')).toBeVisible();
    await page.getByLabel(/Thu nhập mỗi tháng/).fill('10000000');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // step 3 wallet
    await expect(page.getByRole('heading', { name: 'Ví đầu tiên của bạn' })).toBeVisible();
    await page.getByLabel(/Tên ví/).fill('');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByText('Bạn đặt tên cho ví nhé')).toBeVisible();
    await page.getByLabel(/Tên ví/).fill(walletName);
    await page.getByLabel('Số dư hiện tại').fill('2500000');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // step 4 template: 50/30/20 preview
    await expect(page.getByRole('heading', { name: 'Chọn cách chia ngân sách' })).toBeVisible();
    await expect(page.getByText(/Gợi ý cho thu nhập/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Hoàn tất thiết lập' }).click();

    await expect(page.getByRole('heading', { name: 'Bạn đã sẵn sàng' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Ví “${walletName}” đã được tạo.`)).toBeVisible();
    await expect(page.getByText(/Đã đặt \d+ ngân sách cho kỳ này\./)).toBeVisible();
    await page.getByRole('button', { name: 'Vào tổng quan' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(walletName).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    w.assertNone();

  });
});

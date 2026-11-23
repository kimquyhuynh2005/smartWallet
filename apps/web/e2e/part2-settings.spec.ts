import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, goto, isReal, login, watchErrors } from './helpers';
import { watchErrorsAllow } from './part2-helpers';

const stored = (page: Page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('sw-ui') ?? '{}')?.state ?? {}; } catch { return {}; } });

async function openSettings(page: Page, path = '/settings') {
  await goto(page, path);
  await expect(page.getByRole('heading', { level: 1, name: /^(Cài đặt|Settings)$/ })).toBeVisible();
}

test.describe('TC-FE-USER-01 profile and display settings persist', () => {
  test('TC-FE-USER-01-01 language vi <-> en persists (stored locally and in the profile)', async ({ page }, info) => {
    const w = watchErrors(page);
    const patches: string[] = [];
    page.on('request', (r) => { if (r.method() === 'PATCH' && /\/me$/.test(r.url())) patches.push(r.postData() ?? ''); });
    await login(page, 'linh', info);
    await openSettings(page);
    try {
      await page.getByRole('radio', { name: 'English' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
      expect((await stored(page)).language).toBe('en');
      await expect.poll(() => patches.some((p) => p.includes('"locale":"en"'))).toBe(true);
      // away and back (client-side) keeps English
      await goto(page, '/budgets');
      await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible();
      await openSettings(page);
      await expect(page.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
      if (isReal(info)) {
        // real API: a full reload keeps the session (refresh cookie) and the language
        await page.reload();
        await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 20_000 });
        expect((await stored(page)).language).toBe('en');
      }
    } finally {
      await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeVisible();
      await expect.poll(() => patches.some((p) => p.includes('"locale":"vi"'))).toBe(true);
    }
    expect((await stored(page)).language).toBe('vi');
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-USER-01-02 theme light/dark persists across navigation', async ({ page }, info) => {
    const w = watchErrors(page);
    await login(page, 'linh', info);
    await openSettings(page);
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.getByRole('radio', { name: 'Tối' }).click();
    await expect.poll(isDark).toBe(true);
    expect((await stored(page)).theme).toBe('dark');
    await goto(page, '/dashboard');
    await openSettings(page);
    expect(await isDark()).toBe(true);
    await expect(page.getByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'true');
    await expectNoHorizontalScroll(page);
    await page.getByRole('radio', { name: 'Sáng' }).click();
    await expect.poll(isDark).toBe(false);
    expect((await stored(page)).theme).toBe('light');
    if (isReal(info)) {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeVisible({ timeout: 20_000 });
      expect(await isDark()).toBe(false);
    }
    w.assertNone();
  });

  test('TC-FE-USER-01-03 month start day is saved with PATCH /me and restored', async ({ page }, info) => {
    const w = watchErrors(page);
    const bodies: string[] = [];
    page.on('request', (r) => { if (r.method() === 'PATCH' && /\/me$/.test(r.url())) bodies.push(r.postData() ?? ''); });
    await login(page, 'linh', info);
    await openSettings(page);
    const select = page.getByLabel('Tháng của mình bắt đầu vào ngày');
    const original = await select.inputValue();
    const target = original === '5' ? '6' : '5';
    const save = page.getByRole('button', { name: 'Lưu ngày bắt đầu' });
    await expect(save).toBeDisabled(); // nothing changed yet
    try {
      await select.selectOption(target);
      await expect(page.getByText(`Kỳ hiện tại với ngày ${target}`)).toBeVisible();
      await save.click();
      await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
      expect(bodies.some((b) => b.includes(`"monthStartDay":${target}`))).toBe(true);
      await goto(page, '/dashboard');
      await openSettings(page);
      await expect(page.getByLabel('Tháng của mình bắt đầu vào ngày')).toHaveValue(target);
      if (isReal(info)) {
        await page.reload();
        await expect(page.getByLabel('Tháng của mình bắt đầu vào ngày')).toHaveValue(target, { timeout: 20_000 });
      }
    } finally {
      await page.getByLabel('Tháng của mình bắt đầu vào ngày').selectOption(original);
      await page.getByRole('button', { name: 'Lưu ngày bắt đầu' }).click();
      await expect.poll(() => bodies.some((b) => b.includes(`"monthStartDay":${original}`))).toBe(true);
    }
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-USER-01-04 preset avatar can be chosen and reset to initials', async ({ page }, info) => {
    const w = watchErrors(page);
    await login(page, 'linh', info);
    await openSettings(page);
    const initials = page.getByRole('radio', { name: 'Dùng chữ cái đầu' });
    const preset = page.getByRole('radio', { name: 'Hình 2' });
    const wasInitials = (await initials.getAttribute('aria-checked')) === 'true';
    try {
      await preset.click();
      await expect(preset).toHaveAttribute('aria-checked', 'true');
      await expect(initials).toHaveAttribute('aria-checked', 'false');
      await goto(page, '/dashboard');
      await openSettings(page);
      await expect(page.getByRole('radio', { name: 'Hình 2' })).toHaveAttribute('aria-checked', 'true');
    } finally {
      if (wasInitials) {
        await page.getByRole('radio', { name: 'Dùng chữ cái đầu' }).click();
        await expect(page.getByRole('radio', { name: 'Dùng chữ cái đầu' })).toHaveAttribute('aria-checked', 'true');
      }
    }
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-USER-01-05 empty full name is refused inline and nothing is sent', async ({ page }, info) => {
    const w = watchErrors(page);
    let patched = 0;
    page.on('request', (r) => { if (r.method() === 'PATCH' && /\/me$/.test(r.url())) patched++; });
    await login(page, 'linh', info);
    await openSettings(page);
    const name = page.getByLabel('Họ và tên');
    const original = await name.inputValue();
    await name.fill('   ');
    await expect(page.getByText('Bạn nhập họ tên giúp mình nhé.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu tên' })).toBeDisabled();
    await name.fill(original);
    expect(patched).toBe(0);
    w.assertNone();
  });
});

test.describe('TC-FE-ALR-02 notification channel switches', () => {
  test('TC-FE-ALR-02-01 channel switches persist and are restored', async ({ page }, info) => {
    const w = watchErrors(page);
    await login(page, 'linh', info);
    await openSettings(page, '/settings/notifications');
    const sw = (n: string) => page.getByRole('switch', { name: n, exact: true });
    await expect(sw('Email')).toBeVisible();
    const before = await Promise.all(['Trong ứng dụng', 'Email', 'Tóm tắt hằng tuần', 'Nhắc mục tiêu'].map(async (n) => (await sw(n).getAttribute('aria-checked')) === 'true'));
    const names = ['Trong ứng dụng', 'Email', 'Tóm tắt hằng tuần', 'Nhắc mục tiêu'];
    try {
      for (const n of ['Email', 'Tóm tắt hằng tuần']) {
        const was = (await sw(n).getAttribute('aria-checked')) === 'true';
        await sw(n).click();
        await expect(sw(n)).toHaveAttribute('aria-checked', String(!was));
      }
      // the on/off word next to the switch follows (state is text, not only colour)
      await goto(page, '/dashboard');
      await openSettings(page, '/settings/notifications');
      await expect(sw('Email')).toHaveAttribute('aria-checked', String(!before[1]));
      await expect(sw('Tóm tắt hằng tuần')).toHaveAttribute('aria-checked', String(!before[2]));
      await expect(sw('Nhắc mục tiêu')).toHaveAttribute('aria-checked', String(before[3]));
      await expectNoHorizontalScroll(page);
    } finally {
      for (let i = 0; i < names.length; i++) {
        const now = (await sw(names[i]).getAttribute('aria-checked')) === 'true';
        if (now !== before[i]) await sw(names[i]).click();
        await expect(sw(names[i])).toHaveAttribute('aria-checked', String(before[i]));
      }
    }
    w.assertNone();
  });

  test('TC-FE-ALR-02-02 muting in-app is explained and survives navigation, then restored', async ({ page }, info) => {
    const w = watchErrors(page);
    await login(page, 'linh', info);
    await openSettings(page, '/settings/notifications');
    const inApp = page.getByRole('switch', { name: 'Trong ứng dụng', exact: true });
    await expect(inApp).toBeVisible();
    const was = (await inApp.getAttribute('aria-checked')) === 'true';
    try {
      await inApp.click();
      await expect(inApp).toHaveAttribute('aria-checked', String(!was));
      await expect(page.getByText(/vẫn lưu lịch sử thông báo/)).toBeVisible();
      await goto(page, '/notifications');
      await openSettings(page, '/settings/notifications');
      await expect(page.getByRole('switch', { name: 'Trong ứng dụng', exact: true })).toHaveAttribute('aria-checked', String(!was));
    } finally {
      const sw = page.getByRole('switch', { name: 'Trong ứng dụng', exact: true });
      if ((await sw.getAttribute('aria-checked')) === 'true' !== was) await sw.click();
      await expect(sw).toHaveAttribute('aria-checked', String(was));
    }
    w.assertNone();
  });
});

test.describe('TC-FE-USER-01 security: password and sessions', () => {
  const fill = async (page: Page, cur: string, next: string) => {
    await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(cur);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(next);
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(next);
  };

  test('TC-FE-USER-01-06 wrong current password -> one inline error, no second toast; right one succeeds', async ({ page }, info) => {
    test.skip(isReal(info), 'POST /me/password is mock-only (docs/backend-requests.md S1); the real API shows the quiet unavailable state, see TC-FE-USER-01-08');
    const w = watchErrorsAllow(page, [400, 404]);
    await login(page, 'linh', info);
    await openSettings(page, '/settings/security');
    await fill(page, 'Sai@12345', 'Moi@123456');
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(page.getByText('Mật khẩu hiện tại chưa đúng.')).toHaveCount(1);
    await expect(page.getByText('Chưa lưu được')).toHaveCount(0);
    await expect(page.getByText('Đã đổi mật khẩu')).toHaveCount(0);
    // client-side validation: mismatched confirmation
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill('Khac@123456');
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(page.getByText('Hai mật khẩu chưa giống nhau.')).toBeVisible();
    // right current password
    await fill(page, 'Demo@12345', 'Moi@123456');
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(page.getByText('Đã đổi mật khẩu').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Mật khẩu hiện tại', { exact: true })).toHaveValue('');
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });

  test('TC-FE-USER-01-07 sessions list: revoke one device, revoke all others', async ({ page }, info) => {
    test.skip(isReal(info), 'GET /me/sessions is mock-only (docs/backend-requests.md S2); the real API shows the quiet unavailable state, see TC-FE-USER-01-08');
    const w = watchErrorsAllow(page, [400, 404]);
    await login(page, 'linh', info);
    await openSettings(page, '/settings/security');
    await expect(page.getByText('Thiết bị này', { exact: true })).toBeVisible();
    const revokeButtons = page.getByRole('button', { name: /^Đăng xuất thiết bị / });
    await expect(revokeButtons).toHaveCount(2);
    await revokeButtons.first().click();
    await expect(page.getByText('Đã đăng xuất thiết bị đó')).toBeVisible();
    await expect(revokeButtons).toHaveCount(1);
    await page.getByRole('button', { name: 'Đăng xuất khỏi các thiết bị khác' }).click();
    const dlg = page.getByRole('dialog', { name: 'Đăng xuất khỏi các thiết bị khác' });
    await expect(dlg).toBeVisible();
    await expectNoHorizontalScroll(page);
    await dlg.getByRole('button', { name: 'Đăng xuất khỏi các thiết bị khác' }).click();
    await expect(page.getByText('Đã đăng xuất khỏi các thiết bị khác')).toBeVisible();
    await expect(revokeButtons).toHaveCount(0);
    await expect(page.getByText('Thiết bị này', { exact: true })).toBeVisible();
    w.assertNone();
  });

  test('TC-FE-USER-01-08 real API: password change and sessions degrade quietly (404 -> notes, no crash)', async ({ page }, info) => {
    test.skip(!isReal(info), 'covers the real API only; the mock implements both (TC-FE-USER-01-06/07)');
    const w = watchErrors(page);
    await login(page, 'linh', info);
    await openSettings(page, '/settings/security');
    await expect(page.getByText('Danh sách thiết bị chưa khả dụng lúc này.')).toBeVisible();
    // the form validates locally; a wrong-looking submit hits 404 and shows the info alert, never a crash
    await fill(page, 'Demo@12345', 'Moi@123456');
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect(page.getByText('Đổi mật khẩu chưa khả dụng lúc này.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Chưa lưu được')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    w.assertNone();
  });
});

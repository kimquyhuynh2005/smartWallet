// Clicks through the 10-minute demo path (docs/demo-script.md) in the MOCK build and saves a screenshot per step.
// (uses the system Chrome, like the e2e suite)
// Usage: node scripts/demo-walkthrough.mjs --base http://localhost:5199 --vp desktop|mobile --out .cache/demo
// No page reload after the first load: the mock database lives in memory and resets on a full reload.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:5199');
const vp = arg('vp', 'desktop');
const out = `${arg('out', '.cache/demo')}/${vp}`;
fs.mkdirSync(out, { recursive: true });
const mobile = vp === 'mobile';
const size = mobile ? { width: 360, height: 780 } : { width: 1440, height: 900 };

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: size, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(403|404|401)/i.test(m.text())) problems.push(`console: ${m.text()}`); });

let n = 0;
const log = [];
async function step(name, fn) {
  n++;
  const id = String(n).padStart(2, '0');
  try {
    await fn();
    await page.waitForTimeout(700); // let reveal/fade animations finish before the screenshot
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    await page.screenshot({ path: `${out}/${id}-${name}.png` });
    log.push(`${sw > cw ? 'OVERFLOW ' : 'ok       '}${id} ${name}${sw > cw ? ` (scrollWidth ${sw} > ${cw})` : ''}`);
  } catch (e) {
    await page.screenshot({ path: `${out}/${id}-${name}-FAILED.png` }).catch(() => {});
    log.push(`FAILED   ${id} ${name}: ${String(e.message).split('\n')[0].slice(0, 200)}`);
    throw e;
  }
}
const go = async (path) => { // client-side navigation keeps the in-memory mock database and token
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForURL(new RegExp(path.replace(/[/?]/g, '\\$&')));
};
const login = async (email, pw) => {
  await go('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Mật khẩu/).first().fill(pw);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
};
const logout = async () => {
  await page.getByRole('button', { name: /Mở menu tài khoản/ }).first().click();
  await page.getByRole('menuitem', { name: /Đăng xuất/ }).click();
  await page.waitForURL(/\/(login|$)/, { timeout: 10000 });
};
const typeAmount = async (dlg, amount) => {
  if (mobile) {
    for (const d of String(amount / 1000)) await dlg.getByRole('button', { name: `Phím ${d}`, exact: true }).click();
    await dlg.getByRole('button', { name: 'Phím 000', exact: true }).click();
  } else await dlg.getByRole('textbox').first().fill(String(amount));
};

try {
  // 1 landing
  await page.goto(`${base}/?lang=vi&theme=light`);
  await step('landing', async () => { await page.getByRole('heading', { level: 1 }).waitFor(); });
  await step('about', async () => { await page.getByRole('link', { name: 'Về chúng tôi' }).first().click(); await page.getByRole('heading', { level: 1 }).waitFor(); });
  await go('/');

  // 2 register -> verify -> login -> onboarding
  const email = 'hoa.pham@example.vn';
  await step('register', async () => {
    await go('/register');
    await page.getByLabel(/Họ và tên/).fill('Phạm Thu Hoa');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Mật khẩu/).first().fill('Demo@12345');
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await page.getByRole('heading', { name: 'Kiểm tra email của bạn' }).waitFor();
  });
  await step('verify', async () => {
    await page.getByRole('button', { name: /Mở liên kết xác thực/ }).click();
    await page.getByRole('heading', { name: 'Email đã được xác thực' }).waitFor();
  });
  await login(email, 'Demo@12345');
  await step('onboarding-name', async () => { await page.getByRole('heading', { name: 'Mình gọi bạn là gì?' }).waitFor({ timeout: 20000 }); await page.getByRole('button', { name: 'Tiếp tục' }).click(); });
  await step('onboarding-income', async () => { await page.getByLabel(/Thu nhập mỗi tháng/).fill('8000000'); await page.getByRole('button', { name: 'Tiếp tục' }).click(); });
  await step('onboarding-wallet', async () => { await page.getByLabel(/Tên ví/).fill('MoMo'); await page.getByLabel('Số dư hiện tại').fill('1500000'); await page.getByRole('button', { name: 'Tiếp tục' }).click(); });
  await step('onboarding-template', async () => { await page.getByRole('heading', { name: 'Chọn cách chia ngân sách' }).waitFor(); await page.getByText(/Gợi ý cho thu nhập/).waitFor(); });
  await step('onboarding-done', async () => { await page.getByRole('button', { name: 'Hoàn tất thiết lập' }).click(); await page.getByRole('heading', { name: 'Bạn đã sẵn sàng' }).waitFor({ timeout: 15000 }); });
  await step('new-user-dashboard', async () => { await page.getByRole('button', { name: 'Vào tổng quan' }).click(); await page.waitForURL(/\/dashboard/); await page.getByRole('heading', { level: 1 }).waitFor(); });
  await logout();

  // 3 Linh: quick add -> 80% alert
  await login('linh@smartwallet.demo', 'Demo@12345');
  await step('dashboard-linh', async () => { await page.waitForURL(/\/dashboard/, { timeout: 20000 }); await page.getByRole('heading', { level: 1 }).waitFor(); await page.getByText('Hôm nay bạn có thể chi tối đa').waitFor({ timeout: 15000 }); await page.waitForTimeout(800); });
  await step('quick-add-open', async () => {
    if (mobile) await page.getByRole('button', { name: 'Thêm giao dịch' }).first().click(); else await page.keyboard.press('n');
    await page.getByRole('dialog', { name: 'Thêm giao dịch' }).waitFor();
  });
  await step('quick-add-filled', async () => {
    const dlg = page.getByRole('dialog', { name: 'Thêm giao dịch' });
    await typeAmount(dlg, 100000);
    await dlg.getByLabel('Danh mục').selectOption({ label: 'Giải trí' });
  });
  await step('alert-80', async () => {
    await page.getByRole('dialog', { name: 'Thêm giao dịch' }).getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Đã dùng 8\d% ngân sách Giải trí/ }).first().waitFor({ timeout: 10000 });
  });
  await step('dashboard-after', async () => { await page.waitForTimeout(600); });
  await step('budgets', async () => { await go('/budgets'); await page.getByRole('heading', { level: 1, name: 'Ngân sách' }).waitFor(); await page.waitForTimeout(700); });
  await step('goals', async () => { await go('/goals'); await page.getByRole('heading', { level: 1, name: 'Mục tiêu' }).waitFor(); await page.waitForTimeout(500); });
  await step('goal-detail', async () => { await page.getByRole('link', { name: /Xem chi tiết Chuyến đi Đà Lạt/ }).click(); await page.getByRole('heading', { name: 'Chuyến đi Đà Lạt' }).waitFor(); });
  await step('goal-contribute', async () => {
    await page.getByRole('button', { name: 'Góp / rút' }).click();
    const dlg = page.getByRole('dialog', { name: 'Góp / rút tiền' });
    await dlg.getByLabel(/^Số tiền/).fill('500000');
    await dlg.getByRole('button', { name: 'Góp vào mục tiêu' }).click();
    await page.getByText(/2\.700\.000/).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
  });
  await step('reports-free', async () => { await go('/reports'); await page.getByRole('heading', { level: 1, name: 'Báo cáo' }).waitFor(); await page.waitForTimeout(900); });

  // 4 plan limit -> upgrade
  await step('plan-limit', async () => {
    await go('/wallets');
    await page.getByRole('button', { name: 'Thêm ví' }).first().click();
    const form = page.getByRole('dialog', { name: 'Thêm ví' });
    await form.getByLabel(/^Tên ví/).fill('Du lịch');
    await form.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Tính năng của Premium' }).waitFor({ timeout: 10000 });
  });
  await step('plans', async () => { await page.getByRole('dialog', { name: 'Tính năng của Premium' }).getByRole('link', { name: 'Xem các gói' }).click(); await page.getByRole('heading', { level: 1, name: 'Gói dịch vụ' }).waitFor(); });
  await step('checkout', async () => { await page.getByRole('button', { name: 'Nâng cấp Premium' }).click(); await page.getByRole('dialog', { name: 'Nâng cấp lên Premium' }).waitFor(); });
  await step('premium-active', async () => { await page.getByRole('button', { name: 'Xác nhận dùng thử' }).click(); await page.getByText('Bạn đang dùng gói Premium.').waitFor({ timeout: 10000 }); });
  await step('wallet-after-upgrade', async () => {
    await go('/wallets');
    await page.getByRole('button', { name: 'Thêm ví' }).first().click();
    const form = page.getByRole('dialog', { name: 'Thêm ví' });
    await form.getByLabel(/^Tên ví/).fill('Du lịch');
    await form.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByText('Đã tạo ví Du lịch').waitFor({ timeout: 10000 });
  });
  await step('reports-12m', async () => { await go('/reports'); await page.getByRole('tab', { name: /12 tháng/ }).click(); await page.waitForTimeout(900); });
  await logout();

  // 5 Minh (Premium) cameo, then admin
  await login('minh@smartwallet.demo', 'Demo@12345');
  await step('minh-goals', async () => { await page.waitForURL(/\/dashboard/, { timeout: 20000 }); await go('/goals'); await page.getByRole('heading', { level: 1, name: 'Mục tiêu' }).waitFor(); await page.waitForTimeout(500); });
  await logout();
  await login('admin@smartwallet.demo', 'Demo@12345');
  await step('admin', async () => { await page.waitForURL(/\/admin/, { timeout: 20000 }); await page.getByRole('heading', { level: 1 }).waitFor(); await page.waitForTimeout(900); });
} catch (e) {
  log.push(`STOPPED: ${String(e.message).split('\n')[0]}`);
}
console.log(log.join('\n'));
console.log(problems.length ? `console/page problems:\n${[...new Set(problems)].join('\n')}` : 'no console errors or uncaught exceptions');
await browser.close();
process.exit(log.some((l) => l.startsWith('FAILED') || l.startsWith('STOPPED')) ? 1 : 0);

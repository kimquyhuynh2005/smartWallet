import { defineConfig, devices } from '@playwright/test';

/**
 * E2E for apps/web.
 *   mock-*  : the Vite dev server in mock mode (MSW in the browser, port 5199); always available.
 *   real-*  : the Vite dev server against the local API (VITE_USE_MOCKS=false, /api proxied to :3000, port 5198).
 *             Only included when E2E_REAL=1 (the API, Postgres and Redis must be running). It writes to the dev database,
 *             so real-* tests create their own uniquely named data and never delete anything they did not create.
 * Chrome is the system install (channel 'chrome'): no browser download, nothing written to the C: drive.
 *
 *   npm run e2e -w @smartwallet/web                # mocks, mobile + desktop
 *   E2E_REAL=1 npm run e2e -w @smartwallet/web     # also (or only, with --project=real-*) the real API
 */
const REAL = process.env.E2E_REAL === '1';
const MOCK_URL = 'http://localhost:5199';
const REAL_URL = 'http://localhost:5198';

const desktop = { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' } as const;
const mobile = { ...devices['Pixel 5'], channel: 'chrome', viewport: { width: 360, height: 740 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' } as const;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  outputDir: './.cache/e2e/results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // one browser at a time: this machine has little free commit memory (small pagefile on a full C: drive) and Chrome fails to start otherwise
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './.cache/e2e/report' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  projects: [
    { name: 'mock-desktop', use: { ...desktop, baseURL: MOCK_URL } },
    { name: 'mock-mobile', use: { ...mobile, baseURL: MOCK_URL } },
    ...(REAL
      ? [
          // one worker at a time against the real DB: the tests share the seeded demo and admin accounts
          // timeout: real logins are paced (e2e/helpers.ts) to stay under the API's 10 auth requests/min per IP
          { name: 'real-desktop', use: { ...desktop, baseURL: REAL_URL }, fullyParallel: false, timeout: 120_000 },
          { name: 'real-mobile', use: { ...mobile, baseURL: REAL_URL }, fullyParallel: false, timeout: 120_000 },
        ]
      : []),
  ],
  webServer: [
    { command: 'npx vite --mode mock --port 5199', url: MOCK_URL, reuseExistingServer: true, timeout: 90_000, stdout: 'ignore' },
    ...(REAL
      ? [{ command: 'npx vite --port 5198', url: REAL_URL, reuseExistingServer: true, timeout: 90_000, stdout: 'ignore' as const, env: { VITE_USE_MOCKS: 'false', VITE_API_URL: '/api/v1' } }]
      : []),
  ],
});

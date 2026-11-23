// Runs before every integration test file. DATABASE_URL and REDIS_URL must come from the environment (CI service containers / local compose).
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_ACTION_SECRET ??= 'test-action-secret';
process.env.COOKIE_SECURE = 'false';
process.env.APP_URL = 'http://app.test';
process.env.RATE_LIMIT_DISABLED = 'true'; // the rate-limit spec switches it on explicitly
process.env.MAIL_TRANSPORT = 'console';
delete process.env.GOOGLE_CLIENT_ID; // unconfigured by default; google spec overrides the guard
delete process.env.GOOGLE_CLIENT_SECRET;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests');
if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for integration tests');

/** BullMQ connection options from REDIS_URL (redis://[user:pass@]host:port[/db]). */
export function connectionFromEnv() {
  const u = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
  };
}

export const bullPrefix = () => process.env.BULL_PREFIX ?? 'sw';

/** Background workers run in the API process unless WORKERS=off (and never auto-start under tests, which start them explicitly). */
export const workersEnabled = () => process.env.NODE_ENV !== 'test' && process.env.WORKERS !== 'off';

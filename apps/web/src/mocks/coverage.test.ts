import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handlers } from './handlers';

/**
 * TC-FE-MSW-01: every operation of the API contract (apps/api/openapi.json) has an MSW handler, so any screen can be built and demoed with
 * VITE_USE_MOCKS=true. The few endpoints the UI needs that the API does not have yet are mocked in extra-handlers.ts and listed in docs/backend-requests.md.
 */
const spec = JSON.parse(readFileSync(resolve(__dirname, '../../../api/openapi.json'), 'utf8')) as { paths: Record<string, Record<string, unknown>> };
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const norm = (p: string) => p.replace(/^.*\/api\/v1/, '').replace(/\{(\w+)\}/g, ':$1').replace(/:\w+/g, ':p');
const mocked = new Set(handlers.map((h) => { const i = (h as unknown as { info: { method: string; path: string } }).info; return `${String(i.method).toLowerCase()} ${norm(String(i.path))}`; }));

describe('MSW covers the API contract', () => {
  const ops = Object.entries(spec.paths).flatMap(([path, v]) => METHODS.filter((m) => v[m]).map((m) => `${m} ${norm(path)}`));
  it('the contract is not empty', () => expect(ops.length).toBeGreaterThan(40));
  it.each(ops)('%s', (op) => {
    // the health check lives outside /api/v1
    if (op.endsWith('/health')) return;
    expect(mocked.has(op), `no MSW handler for ${op}`).toBe(true);
  });
  it('the endpoints the UI needs beyond the contract are mocked too (docs/backend-requests.md)', () => {
    for (const op of ['get /subscriptions/me', 'get /goals/:p/contributions', 'post /auth/resend-verification', 'post /me/password', 'get /me/sessions', 'delete /me/sessions/:p', 'post /me/sessions/revoke-others', 'post /subscriptions/cancel', 'get /reports/top-notes',
      'patch /admin/users/:p', 'get /admin/stats/growth', 'get /admin/categories', 'post /admin/categories', 'patch /admin/categories/:p', 'delete /admin/categories/:p', 'get /admin/category-rules', 'post /admin/category-rules', 'delete /admin/category-rules/:p', 'get /admin/plans', 'patch /admin/plans/:p']) expect(mocked.has(op), op).toBe(true);
  });
});

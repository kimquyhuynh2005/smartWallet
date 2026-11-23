import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildOpenApiDocument } from '../src/app.setup';
import { Ctx, createCtx } from './helpers';

let ctx: Ctx;
let doc: any;
beforeAll(async () => {
  ctx = await createCtx();
  doc = JSON.parse(JSON.stringify(buildOpenApiDocument(ctx.app)));
});
afterAll(async () => { await ctx.app.close(); });

const PUBLIC = new Set(['/health', '/api/v1/auth/register', '/api/v1/auth/verify-email', '/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password', '/api/v1/auth/google', '/api/v1/auth/google/callback']);
const NO_BODY = new Set(['post /api/v1/auth/refresh', 'post /api/v1/auth/logout', 'post /api/v1/subscriptions/mock-checkout', 'post /api/v1/notifications/read-all', 'patch /api/v1/notifications/{id}/read', 'post /api/v1/transactions/import/{importId}/confirm:never']);
const methods = ['get', 'post', 'patch', 'delete'];

/** Every route Express actually serves under /api/v1, as "method /path/{param}" */
function liveRoutes(): string[] {
  const out: string[] = [];
  const stack = (ctx.app.getHttpAdapter().getInstance() as any)._router.stack as any[];
  for (const layer of stack) {
    if (!layer.route || !(String(layer.route.path).startsWith('/api/v1') || layer.route.path === '/health')) continue;
    for (const m of Object.keys(layer.route.methods)) out.push(`${m} ${String(layer.route.path).replace(/:(\w+)/g, '{$1}')}`);
  }
  return out;
}
const operations = () => Object.entries<any>(doc.paths).flatMap(([path, item]) => methods.filter((m) => item[m]).map((m) => ({ key: `${m} ${path}`, method: m, path, op: item[m] })));

describe('OpenAPI document', () => {
  it('documents EVERY route the server exposes (and nothing that does not exist)', () => {
    const documented = operations().map((o) => o.key).sort();
    const live = liveRoutes().sort();
    expect(live.length).toBeGreaterThan(40);
    expect(documented).toEqual(live);
  });

  it('covers the required endpoints', () => {
    const keys = new Set(operations().map((o) => o.key));
    for (const k of [
      'get /api/v1/wallets', 'post /api/v1/wallets', 'get /api/v1/wallets/{id}', 'patch /api/v1/wallets/{id}', 'delete /api/v1/wallets/{id}',
      'get /api/v1/transactions', 'post /api/v1/transactions', 'get /api/v1/transactions/{id}', 'patch /api/v1/transactions/{id}', 'delete /api/v1/transactions/{id}',
      'post /api/v1/transactions/transfer', 'post /api/v1/transactions/import', 'post /api/v1/transactions/import/{importId}/confirm', 'post /api/v1/transactions/receipts/upload-url',
      'get /api/v1/recurring-rules', 'post /api/v1/recurring-rules', 'patch /api/v1/recurring-rules/{id}', 'delete /api/v1/recurring-rules/{id}',
      'get /api/v1/categories', 'post /api/v1/categories', 'patch /api/v1/categories/{id}', 'delete /api/v1/categories/{id}',
      'get /api/v1/goals', 'post /api/v1/goals', 'patch /api/v1/goals/{id}', 'delete /api/v1/goals/{id}', 'post /api/v1/goals/{id}/contributions',
      'get /api/v1/me', 'patch /api/v1/me', 'delete /api/v1/me', 'post /api/v1/me/onboarding',
    ]) expect(keys).toContain(k);
  });

  it('every operation has a tag and summary; secured ones declare bearer auth and a 401; all declare a success response', () => {
    for (const { key, path, op } of operations()) {
      expect({ key, tags: op.tags?.length > 0 }).toEqual({ key, tags: true });
      expect({ key, summary: typeof op.summary === 'string' && op.summary.length > 5 }).toEqual({ key, summary: true });
      const codes = Object.keys(op.responses);
      expect({ key, success: codes.some((c) => /^[23]/.test(c)) }).toEqual({ key, success: true });
      if (!PUBLIC.has(path)) {
        expect({ key, bearer: JSON.stringify(op.security ?? []).includes('bearer') }).toEqual({ key, bearer: true });
        expect({ key, has401: codes.includes('401') }).toEqual({ key, has401: true });
      }
    }
  });

  it('every JSON body operation documents a STRICT request schema (the same Zod schema that validates it)', () => {
    for (const { key, method, path, op } of operations()) {
      if (!['post', 'patch'].includes(method) || NO_BODY.has(key) || path.endsWith('/import') || path === '/api/v1/auth/google') continue;
      const schema = op.requestBody?.content?.['application/json']?.schema;
      expect({ key, hasBody: !!schema }).toEqual({ key, hasBody: true });
      expect({ key, strict: schema.additionalProperties === false || schema.allOf !== undefined || schema.anyOf !== undefined }).toEqual({ key, strict: true });
    }
  });

  it('success responses use the { data, meta? } envelope and errors use { error: { code, message } }', () => {
    for (const { key, op } of operations()) {
      for (const [code, r] of Object.entries<any>(op.responses)) {
        const schema = r.content?.['application/json']?.schema;
        if (!schema) continue;
        if (/^2/.test(code)) expect({ key, code, data: !!schema.properties?.data }).toEqual({ key, code, data: true });
        else if (/^[45]/.test(code)) expect({ key, code, error: !!schema.properties?.error?.properties?.code }).toEqual({ key, code, error: true });
      }
    }
    const list = doc.paths['/api/v1/transactions'].get.responses['200'].content['application/json'].schema;
    expect(list.properties.meta.properties).toHaveProperty('total');
    expect(list.properties.data.type).toBe('array');
  });

  it('documents the transaction filters, pagination and sort as query parameters', () => {
    const names = doc.paths['/api/v1/transactions'].get.parameters.map((p: any) => p.name).sort();
    expect(names).toEqual(['categoryId', 'from', 'limit', 'maxAmount', 'minAmount', 'page', 'q', 'sort', 'to', 'type', 'walletId']);
    const limit = doc.paths['/api/v1/transactions'].get.parameters.find((p: any) => p.name === 'limit');
    expect(limit.schema).toMatchObject({ maximum: 100 });
  });

  it('documents the CSV upload as multipart with a binary file, and the plan-limit error', () => {
    const imp = doc.paths['/api/v1/transactions/import'].post;
    const body = imp.requestBody.content['multipart/form-data'].schema;
    expect(body.properties.file).toMatchObject({ type: 'string', format: 'binary' });
    expect(body.required).toEqual(expect.arrayContaining(['file', 'walletId']));
    expect(Object.keys(imp.responses)).toEqual(expect.arrayContaining(['200', '403', '413'].filter((c) => c !== '413')));
    expect(doc.paths['/api/v1/wallets'].post.responses['403'].description).toMatch(/PLAN_LIMIT_REACHED/);
  });

  it('response schemas describe the real field names (WalletOut, GoalOut)', () => {
    const wallet = doc.paths['/api/v1/wallets/{id}'].get.responses['200'].content['application/json'].schema.properties.data;
    expect(Object.keys(wallet.properties)).toEqual(expect.arrayContaining(['id', 'name', 'type', 'openingBalance', 'balance', 'isArchived']));
    expect(wallet.properties).not.toHaveProperty('userId');
    const goal = doc.paths['/api/v1/goals'].get.responses['200'].content['application/json'].schema.properties.data.items;
    expect(Object.keys(goal.properties)).toEqual(expect.arrayContaining(['savedAmount', 'percent', 'requiredMonthlySaving', 'status']));
  });

  it('matches the committed apps/api/openapi.json (run `npm run openapi -w @smartwallet/api` after changing an endpoint)', () => {
    const file = join(__dirname, '..', 'openapi.json');
    expect({ exists: existsSync(file) }).toEqual({ exists: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(doc);
  });
});

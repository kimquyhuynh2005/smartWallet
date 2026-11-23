import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiEvents, request } from './client';
import { session } from './session';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); session.clear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('does one silent refresh for many parallel 401s, then retries each call', async () => {
    session.set('old');
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) { refreshCalls++; return json(200, { data: { accessToken: 'new' } }); }
      const auth = new Headers(init.headers).get('authorization');
      return auth === 'Bearer new' ? json(200, { data: { ok: true } }) : json(401, { error: { code: 'UNAUTHORIZED', message: 'x', details: null } });
    });
    const out = await Promise.all([request('/a'), request('/b'), request('/c')]);
    expect(out).toHaveLength(3);
    expect(refreshCalls).toBe(1);
    expect(session.get()).toBe('new');
  });

  it('emits session-expired and throws when the refresh fails', async () => {
    session.set('old');
    const expired = vi.fn();
    const off = apiEvents.on('session-expired', expired);
    fetchMock.mockImplementation(async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'x', details: null } }));
    await expect(request('/a')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalled();
    off();
  });

  it('maps the error envelope to ApiError(status, code, details)', async () => {
    session.set('t');
    fetchMock.mockResolvedValue(json(403, { error: { code: 'PLAN_LIMIT_REACHED', message: 'limit', details: { limit: 'max_wallets', max: 3 } } }));
    await expect(request('/wallets', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT_REACHED', details: { max: 3 } });
  });

  it('validates data with the supplied Zod schema', async () => {
    session.set('t');
    fetchMock.mockResolvedValue(json(200, { data: { n: 'not-a-number' } }));
    await expect(request('/x', { schema: z.object({ n: z.number() }) })).rejects.toBeTruthy();
  });

  it('a network failure becomes code NETWORK_ERROR', async () => {
    session.set('t');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

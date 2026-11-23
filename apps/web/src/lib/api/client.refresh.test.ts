import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiEvents, request } from './client';
import { session } from './session';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const unauthorized = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'x', details: null } });

describe('TC-FE-AUTH-02 silent refresh', () => {
  const fetchMock = vi.fn();
  const events = { expired: vi.fn(), offline: vi.fn(), online: vi.fn() };
  let offs: Array<() => void> = [];
  const isRefresh = (u: unknown) => String(u).endsWith('/auth/refresh');
  const refreshCalls = () => fetchMock.mock.calls.filter((c) => isRefresh(c[0])).length;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    Object.values(events).forEach((f) => f.mockReset());
    offs = [apiEvents.on('session-expired', events.expired), apiEvents.on('offline', events.offline), apiEvents.on('online', events.online)];
    session.clear();
  });
  afterEach(() => { offs.forEach((o) => o()); vi.unstubAllGlobals(); });

  it('TC-FE-AUTH-02-01 ten concurrent 401s trigger exactly ONE refresh and every call is retried once with the new token', async () => {
    session.set('old');
    const seen: Record<string, string[]> = {};
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (isRefresh(url)) { await new Promise((r) => setTimeout(r, 15)); return json(200, { data: { accessToken: 'new' } }); }
      const auth = new Headers(init.headers).get('authorization') ?? '';
      (seen[url] ??= []).push(auth);
      return auth === 'Bearer new' ? json(200, { data: { ok: true } }) : unauthorized();
    });
    const out = await Promise.all(Array.from({ length: 10 }, (_, i) => request(`/r${i}`)));
    expect(out).toEqual(Array(10).fill({ ok: true }));
    expect(refreshCalls()).toBe(1);
    for (const calls of Object.values(seen)) expect(calls).toEqual(['Bearer old', 'Bearer new']); // first try, then ONE retry
    expect(session.get()).toBe('new');
    expect(events.expired).not.toHaveBeenCalled();
  });

  it('TC-FE-AUTH-02-02 the refresh call carries the httpOnly cookie (credentials include) and no bearer', async () => {
    session.set('old');
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => (isRefresh(url) ? json(200, { data: { accessToken: 'n' } }) : new Headers(init.headers).get('authorization') === 'Bearer n' ? json(200, { data: 1 }) : unauthorized()));
    await request('/a');
    const call = fetchMock.mock.calls.find((c) => isRefresh(c[0]))!;
    expect(call[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(new Headers(call[1].headers).get('authorization')).toBeNull();
  });

  it('TC-FE-AUTH-02-03 a retry that is still 401 is NOT retried again (no loop) and surfaces the server error', async () => {
    session.set('old');
    fetchMock.mockImplementation(async (url: string) => (isRefresh(url) ? json(200, { data: { accessToken: 'new' } }) : unauthorized()));
    await expect(request('/a')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(refreshCalls()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3); // call, refresh, retry
  });

  it('TC-FE-AUTH-02-04 a later 401 starts a NEW refresh (the shared promise is not kept forever)', async () => {
    session.set('old');
    let n = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (isRefresh(url)) return json(200, { data: { accessToken: `t${++n}` } });
      const auth = new Headers(init.headers).get('authorization');
      return auth === `Bearer t${n}` && n > 0 ? json(200, { data: 'ok' }) : unauthorized();
    });
    await request('/a');
    session.set('expired-again');
    await request('/b');
    expect(refreshCalls()).toBe(2);
  });

  it('TC-FE-AUTH-02-05 refresh rejected (401): session cleared, session-expired emitted once, SESSION_EXPIRED error for every caller', async () => {
    session.set('old');
    fetchMock.mockImplementation(async () => unauthorized());
    const results = await Promise.allSettled([request('/a'), request('/b'), request('/c')]);
    for (const r of results) {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    }
    expect(refreshCalls()).toBe(1);
    expect(session.get()).toBeNull();
    expect(events.expired).toHaveBeenCalled();
  });

  it('TC-FE-AUTH-02-06 NETWORK error during /auth/refresh keeps the session, rejects NETWORK_ERROR, emits offline, NOT session-expired', async () => {
    session.set('old');
    fetchMock.mockImplementation(async (url: string) => {
      if (isRefresh(url)) throw new TypeError('Failed to fetch');
      return unauthorized();
    });
    await expect(request('/a')).rejects.toMatchObject({ name: 'ApiError', code: 'NETWORK_ERROR', status: 0 });
    expect(session.get()).toBe('old'); // not logged out: the app shows a retry screen
    expect(events.offline).toHaveBeenCalled();
    expect(events.expired).not.toHaveBeenCalled();
  });

  it('TC-FE-AUTH-02-07 after a refresh network blip the NEXT call can refresh again and recover', async () => {
    session.set('old');
    let down = true;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (isRefresh(url)) { if (down) throw new TypeError('Failed to fetch'); return json(200, { data: { accessToken: 'new' } }); }
      return new Headers(init.headers).get('authorization') === 'Bearer new' ? json(200, { data: 'ok' }) : unauthorized();
    });
    await expect(request('/a')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    down = false;
    await expect(request('/a')).resolves.toBe('ok');
    expect(session.get()).toBe('new');
    expect(events.expired).not.toHaveBeenCalled();
  });

  it('TC-FE-AUTH-02-08 concurrent calls share the failed refresh: one refresh attempt, all reject NETWORK_ERROR', async () => {
    session.set('old');
    fetchMock.mockImplementation(async (url: string) => { if (isRefresh(url)) throw new TypeError('Failed to fetch'); return unauthorized(); });
    const rs = await Promise.allSettled([request('/a'), request('/b'), request('/c')]);
    expect(rs.map((r) => (r.status === 'rejected' ? (r.reason as ApiError).code : 'ok'))).toEqual(['NETWORK_ERROR', 'NETWORK_ERROR', 'NETWORK_ERROR']);
    expect(refreshCalls()).toBe(1);
    expect(session.get()).toBe('old');
  });

  it('TC-FE-AUTH-02-09 anonymous requests never refresh, never send the token, never log out', async () => {
    session.set('keep');
    fetchMock.mockImplementation(async () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'bad', details: null } }));
    await expect(request('/auth/login', { method: 'POST', body: {}, anonymous: true })).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(refreshCalls()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBeNull();
    expect(session.get()).toBe('keep');
    expect(events.expired).not.toHaveBeenCalled();
  });

  it('TC-FE-AUTH-02-10 a network error on a normal request does not touch the session and does not refresh', async () => {
    session.set('t');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/a')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(refreshCalls()).toBe(0);
    expect(session.get()).toBe('t');
    expect(events.offline).toHaveBeenCalled();
  });

  it('TC-FE-AUTH-02-11 a 403 / 500 is not a refresh trigger', async () => {
    session.set('t');
    fetchMock.mockResolvedValue(json(500, { error: { code: 'INTERNAL', message: 'boom', details: null } }));
    await expect(request('/a')).rejects.toMatchObject({ status: 500 });
    expect(refreshCalls()).toBe(0);
  });

  it('TC-FE-AUTH-02-12 an aborted request is not reported as a network error / offline', async () => {
    session.set('t');
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(request('/a')).rejects.toMatchObject({ name: 'AbortError' });
    expect(events.offline).not.toHaveBeenCalled();
  });
});

import type { ZodTypeAny } from 'zod';
import { session } from './session';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1';

export interface ApiErrorInit { status: number; code: string; message: string; details?: unknown }
export class ApiError extends Error {
  status: number; code: string; details?: unknown;
  constructor(i: ApiErrorInit) { super(i.message); this.name = 'ApiError'; this.status = i.status; this.code = i.code; this.details = i.details; }
}

/** tiny typed event bus: the client reports, the app (providers.tsx) reacts. Keeps the client free of React and router imports. */
type Events = { 'session-expired': void; offline: void; online: void };
const listeners: { [K in keyof Events]: Set<(p: Events[K]) => void> } = { 'session-expired': new Set(), offline: new Set(), online: new Set() };
export const apiEvents = {
  on<K extends keyof Events>(k: K, f: (p: Events[K]) => void) { listeners[k].add(f); return () => { listeners[k].delete(f); }; },
  emit<K extends keyof Events>(k: K, p?: Events[K]) { listeners[k].forEach((f) => f(p as Events[K])); },
};

export interface RequestOptions<S extends ZodTypeAny | undefined = undefined> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** validates (and types) `data`; a mismatch with the shared contract fails loudly instead of rendering garbage */
  schema?: S;
  /** do not attach the token and do not try to refresh on 401 (auth routes) */
  anonymous?: boolean;
  signal?: AbortSignal;
  formData?: FormData;
  /** return the raw response text (CSV export) */
  text?: boolean;
}
export type Paged<T> = { data: T; meta: { page: number; limit: number; total: number } };

// ---------- silent refresh: ONE refresh in flight, however many requests hit 401 at once ----------
let refreshing: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      let res: Response;
      try { res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' }); } // httpOnly cookie, never readable by JS
      catch {
        // offline or a blip: the session is NOT over, so keep it and let the caller fail with a network error
        apiEvents.emit('offline');
        throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' });
      }
      // a server failure (5xx) says nothing about the session: keep it, like a network blip
      if (res.status >= 500) throw new ApiError({ status: res.status, code: `HTTP_${res.status}`, message: 'Server error' });
      if (!res.ok) throw new Error('refresh rejected');
      const body = await res.json();
      const t: string = body.data.accessToken;
      session.set(t);
      return t;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      session.clear();
      return null;
    } finally {
      // keep the settled promise for this tick only so racing 401s share it, then allow a new refresh later
      queueMicrotask(() => { refreshing = null; });
    }
  })();
  return refreshing;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(`${API_URL}${path}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  return url.toString();
}

async function send(path: string, o: RequestOptions<any>, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token && !o.anonymous) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, o.query), {
      method: o.method ?? 'GET', headers, credentials: 'include', signal: o.signal,
      body: o.formData ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    apiEvents.emit('offline');
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' });
  }
}

async function failure(res: Response): Promise<ApiError> {
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  return new ApiError({ status: res.status, code: body?.error?.code ?? `HTTP_${res.status}`, message: body?.error?.message ?? res.statusText, details: body?.error?.details });
}

export async function request<S extends ZodTypeAny | undefined = undefined>(path: string, o: RequestOptions<S> = {}): Promise<any> {
  let res = await send(path, o, session.get());
  if (res.status === 401 && !o.anonymous) {
    const fresh = await refreshAccessToken(); // single in-flight refresh
    if (!fresh) {
      apiEvents.emit('session-expired'); // refresh failed: log out
      throw new ApiError({ status: 401, code: 'SESSION_EXPIRED', message: 'Session expired' });
    }
    res = await send(path, o, fresh); // retry once with the new token
  }
  apiEvents.emit('online');
  if (!res.ok) throw await failure(res);
  if (o.text) return res.text();
  if (res.status === 204) return undefined;
  const body = await res.json();
  if (o.schema) {
    const parsed = (o.schema as ZodTypeAny).safeParse(body.data);
    if (!parsed.success) {
      console.error('[api] response does not match the shared contract', path, parsed.error.issues);
      throw new ApiError({ status: res.status, code: 'RESPONSE_SHAPE', message: 'Unexpected response', details: parsed.error.issues });
    }
    return body.meta ? { data: parsed.data, meta: body.meta } : parsed.data;
  }
  return body.meta ? { data: body.data, meta: body.meta } : body.data;
}

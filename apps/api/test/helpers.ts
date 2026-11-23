import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/common/redis.service';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { StorageService, UploadTicket } from '../src/storage/storage.service';

export class CapturingMail extends MailService {
  sent: MailMessage[] = [];
  async send(m: MailMessage) { this.sent.push(m); }
  /** token from the newest mail sent to `to` */
  tokenFor(to: string): string {
    const m = [...this.sent].reverse().find((x) => x.to === to);
    if (!m) throw new Error(`no mail sent to ${to}`);
    return /token=([^\s&]+)/.exec(m.text)![1];
  }
  count(to: string) { return this.sent.filter((x) => x.to === to).length; }
}

/** S3 stand-in: same contract as the real service, no network. */
export class FakeStorage extends StorageService {
  isConfigured() { return true; }
  async createUploadTicket(key: string, contentType: string, maxBytes: number): Promise<UploadTicket> {
    return { url: 'https://s3.test/receipts', fields: { key, 'Content-Type': contentType, 'x-max-bytes': String(maxBytes) } };
  }
  async getDownloadUrl(key: string) { return `https://s3.test/get/${key}?sig=1`; }
}

export interface Ctx {
  app: INestApplication;
  mail: CapturingMail;
  prisma: PrismaService;
  redis: RedisService;
  http: () => ReturnType<typeof request>;
}

export async function createCtx(customise: (b: TestingModuleBuilder) => TestingModuleBuilder = (b) => b): Promise<Ctx> {
  const mail = new CapturingMail();
  const mod = await customise(
    Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(mail).overrideProvider(StorageService).useValue(new FakeStorage()),
  ).compile();
  const app = configureApp(mod.createNestApplication());
  await app.init();
  return { app, mail, prisma: app.get(PrismaService), redis: app.get(RedisService), http: () => request(app.getHttpServer()) };
}

export const uniqueEmail = () => `t${randomUUID().slice(0, 8)}@test.local`;
export const PASSWORD = 'Passw0rd!x';
export const cookieOf = (res: request.Response): string => {
  const c = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((x) => x.startsWith('refresh_token='));
  if (!c) throw new Error('no refresh cookie');
  return c.split(';')[0];
};
export const rawSetCookie = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((x) => x.startsWith('refresh_token='))!;

export interface Session { email: string; userId: string; accessToken: string; cookie: string; auth: { Authorization: string } }

/** register -> verify email -> login. */
export async function signup(ctx: Ctx, opts: { email?: string; password?: string; verify?: boolean } = {}): Promise<Session> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? PASSWORD;
  const reg = await ctx.http().post('/api/v1/auth/register').send({ email, password, fullName: 'Test User' }).expect(201);
  if (opts.verify !== false) await ctx.http().post('/api/v1/auth/verify-email').send({ token: ctx.mail.tokenFor(email) }).expect(204);
  const login = await ctx.http().post('/api/v1/auth/login').send({ email, password });
  if (opts.verify === false) return { email, userId: reg.body.data.id, accessToken: '', cookie: '', auth: { Authorization: '' } };
  expect(login.status).toBe(200);
  const accessToken = login.body.data.accessToken as string;
  return { email, userId: reg.body.data.id, accessToken, cookie: cookieOf(login), auth: { Authorization: `Bearer ${accessToken}` } };
}

export async function clearRateLimits(ctx: Ctx) {
  const keys = await ctx.redis.client.keys('rl:*');
  if (keys.length) await ctx.redis.client.del(...keys);
}

// ---------- domain helpers ----------
export const now = () => new Date().toISOString();
export const premium = async (ctx: Ctx, s: Session) => { await ctx.http().post('/api/v1/subscriptions/mock-checkout').set(s.auth).expect(200); };

export async function mkWallet(ctx: Ctx, s: Session, over: Record<string, unknown> = {}) {
  const res = await ctx.http().post('/api/v1/wallets').set(s.auth).send({ name: 'W', type: 'CASH', ...over }).expect(201);
  return res.body.data as { id: string; balance: number };
}
export async function mkTxn(ctx: Ctx, s: Session, walletId: string, over: Record<string, unknown> = {}) {
  const res = await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId, type: 'EXPENSE', amount: 10_000, occurredAt: now(), ...over }).expect(201);
  return res.body.data as { id: string };
}
export async function balanceOf(ctx: Ctx, s: Session, walletId: string): Promise<number> {
  return (await ctx.http().get(`/api/v1/wallets/${walletId}`).set(s.auth).expect(200)).body.data.balance;
}
export async function systemCategory(ctx: Ctx, s: Session, type: 'EXPENSE' | 'INCOME', nameEn?: string) {
  const list = (await ctx.http().get('/api/v1/categories').set(s.auth).expect(200)).body.data as any[];
  return list.find((c) => c.type === type && c.isSystem && (!nameEn || c.nameEn === nameEn))!.id as string;
}

/** Response contract: the real payload must match the SAME Zod schema that generates the OpenAPI document (extra fields fail too). */
export function expectShape(schema: z.ZodTypeAny, value: unknown) {
  const s = schema instanceof z.ZodObject ? schema.strict() : schema;
  const r = s.safeParse(value);
  if (!r.success) throw new Error(`response does not match its documented schema:\n${JSON.stringify(r.error.issues, null, 2)}\nvalue: ${JSON.stringify(value)}`);
}

/** Collects domain events published on the in-process bus. */
export function captureEvents(ctx: Ctx, name = 'transaction.changed') {
  const seen: any[] = [];
  ctx.app.get(EventEmitter2).on(name, (e: any) => { seen.push(e); });
  return seen;
}

// ---------- budgets / realtime helpers ----------
export async function mkBudget(ctx: Ctx, s: Session, categoryId: string | null, limitAmount: number, extra: Record<string, unknown> = {}) {
  const res = await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId, limitAmount, ...extra }).expect(201);
  return res.body.data as { id: string; period: string };
}

/** Starts the HTTP listener (once) and opens an authenticated Socket.IO connection to namespace /ws. */
export async function connectSocket(ctx: Ctx, token: string | null, extraAuth: Record<string, unknown> = {}): Promise<Socket> {
  const server: any = ctx.app.getHttpServer();
  if (!server.listening) await ctx.app.listen(0);
  const port = server.address().port as number;
  const socket = io(`http://127.0.0.1:${port}/ws`, { transports: ['websocket'], forceNew: true, reconnection: false, auth: token ? { token, ...extraAuth } : extraAuth });
  sockets.push(socket);
  return socket;
}
const sockets: Socket[] = [];
export const closeSockets = () => { sockets.splice(0).forEach((x) => x.close()); };

export const nextEvent = <T = any>(socket: Socket, event: string, ms = 2000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no "${event}" within ${ms} ms`)), ms);
    socket.once(event, (p: T) => { clearTimeout(t); resolve(p); });
  });
export const connected = (socket: Socket) => new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', (e) => reject(e)); });
/** true if NO such event arrives within `ms` */
export const quiet = (socket: Socket, event: string, ms = 600) => new Promise<boolean>((resolve) => { const t = setTimeout(() => resolve(true), ms); socket.once(event, () => { clearTimeout(t); resolve(false); }); });
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

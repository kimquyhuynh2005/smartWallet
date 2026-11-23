import { delay, http, HttpResponse } from 'msw';
import type { ZodTypeAny } from 'zod';
import {
  ApplyTemplateSchema, BUDGET_TEMPLATES, ConfirmImportSchema, ContributionSchema, CreateBudgetSchema, CreateCategorySchema, CreateGoalSchema, CreateRecurringRuleSchema,
  CreateTransactionSchema, CreateWalletSchema, DeleteAccountSchema, ExportQuerySchema, ForgotPasswordSchema, ListBudgetsQuerySchema, ListCategoriesQuerySchema, ListWalletsQuerySchema,
  LoginSchema, NotificationQuerySchema, OnboardingSchema, ReadAllOut, ReceiptUploadSchema, RegisterSchema, ReportPeriodQuerySchema, ResetPasswordSchema, RolloverSchema,
  SuggestCategoryBodySchema, TransactionQuerySchema, TransferSchema, TrendQuerySchema, UpdateBudgetSchema, UpdateCategorySchema, UpdateGoalSchema, UpdateNotificationSettingsSchema,
  UpdateProfileSchema, UpdateRecurringRuleSchema, UpdateTransactionSchema, UpdateWalletSchema, VerifyEmailSchema, ByCategoryQuerySchema, currentBudgetPeriod, formatPeriod, normalizeText,
  periodBounds, shiftPeriodStart,
} from '@smartwallet/shared';
import { API_URL } from '@/lib/api/client';
import { mockBus } from './bus';
import { db, iso, SYSTEM_CATEGORIES, uuid, CAT, type BudgetRec, type GoalRec, type TxnRec, type UserRec } from './db';
import {
  boundsFor, budgetsOfPeriod, budgetView, byCategoryFor, categoriesFor, computeProgress, dailyFor, evaluateAlerts, FREE_LIMITS, limitsOf, notificationView, suggestFor, totalsFor, trendFor,
  txnView, userTxns, walletBalance, walletView,
} from './logic';
import { DEMO } from './seed';
import { extraHandlers } from './extra-handlers';

const LATENCY = Number(import.meta.env.VITE_MOCK_LATENCY ?? 140);
const DAY = 86_400_000;

// ---------------- plumbing ----------------
export const TOKEN_TTL_MS = 15 * 60_000;
export const issueToken = (userId: string) => `mock.${userId}.${Date.now()}`;
const REFRESH_KEY = 'sw-mock-refresh';
const refreshUser = () => { try { return sessionStorage.getItem(REFRESH_KEY); } catch { return null; } };
const setRefreshUser = (id: string | null) => { try { id ? sessionStorage.setItem(REFRESH_KEY, id) : sessionStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ } };

const json = (data: unknown, status = 200, meta?: unknown) => HttpResponse.json(meta ? { data, meta } : { data }, { status });
const fail = (status: number, code: string, message: string, details?: unknown) => HttpResponse.json({ error: { code, message, details } }, { status });
const noContent = () => new HttpResponse(null, { status: 204 });
const notFound = () => fail(404, 'NOT_FOUND', 'Resource not found');
const planLimit = (key: string, limit: number | null) => fail(403, 'PLAN_LIMIT_REACHED', `Plan limit reached for ${key}`, { key, limit });
const premiumOnly = (feature: string) => fail(403, 'PLAN_LIMIT_REACHED', `${feature} requires the Premium plan`, { feature });
const validation = (e: { flatten: () => unknown }) => fail(400, 'VALIDATION_ERROR', 'Invalid input', e.flatten());

interface Ctx { req: Request; user: UserRec; params: Record<string, string>; url: URL; body: any }
type Handler = (c: Ctx) => Response | Promise<Response>;

function userFromToken(req: Request): UserRec | null {
  const m = /^Bearer mock\.([^.]+)\.(\d+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  const issued = Number(m[2]);
  if (issued < db.invalidBefore || Date.now() - issued > TOKEN_TTL_MS) return null;
  const u = db.users.find((x) => x.id === m[1]);
  return u && u.status === 'ACTIVE' ? u : null;
}

/** one place for: latency, "server down", auth, body validation with the SAME shared schemas the real API uses */
function route(method: 'get' | 'post' | 'patch' | 'delete', path: string, opts: { schema?: ZodTypeAny; public?: boolean; admin?: boolean; form?: boolean } | Handler, handler?: Handler) {
  const o = typeof opts === 'function' ? {} : opts;
  const h = (typeof opts === 'function' ? opts : handler)!;
  return http[method](`${API_URL}${path}`, async ({ request, params }) => {
    await delay(LATENCY);
    if (db.down) return HttpResponse.error();
    let user = null as UserRec | null;
    if (!o.public) {
      user = userFromToken(request);
      if (!user) return fail(401, 'UNAUTHORIZED', 'Unauthorized');
      if (o.admin && user.role !== 'ADMIN') return fail(403, 'FORBIDDEN', 'Insufficient role');
    }
    let body: unknown;
    if (o.schema) {
      const raw = method === 'get' ? Object.fromEntries(new URL(request.url).searchParams) : await request.json().catch(() => ({}));
      const parsed = o.schema.safeParse(raw);
      if (!parsed.success) return validation(parsed.error);
      body = parsed.data;
    }
    return h({ req: request, user: user as UserRec, params: params as Record<string, string>, url: new URL(request.url), body });
  });
}

const ownWallet = (u: UserRec, id: string) => db.wallets.find((w) => w.id === id && w.userId === u.id && !w.deletedAt);
const usable = (u: UserRec, id: string) => { const w = ownWallet(u, id); return w ? (w.isArchived ? ('archived' as const) : w) : null; };
const visibleCategory = (u: UserRec, id: string) => categoriesFor(u.id).find((c) => c.id === id);
const planInfoUsage = (u: UserRec) => ({
  wallets: db.wallets.filter((w) => w.userId === u.id && !w.deletedAt && !w.isArchived).length,
  budgets: budgetsOfPeriod(u.id, boundsFor(u.id).periodStart).length,
  goals: db.goals.filter((g) => g.userId === u.id && !g.deletedAt && g.status === 'ACTIVE').length,
});
const meView = (u: UserRec) => ({
  id: u.id, email: u.email, fullName: u.fullName, avatarUrl: u.avatarUrl, role: u.role, status: u.status, locale: u.locale, currency: u.currency, monthStartDay: u.monthStartDay,
  emailVerifiedAt: u.verifiedAt === null ? null : u.createdAt, createdAt: u.createdAt, hasPassword: true, plan: u.plan, onboarded: db.wallets.some((w) => w.userId === u.id && !w.deletedAt),
});
const goalView = (g: GoalRec) => {
  const remaining = Math.max(0, g.targetAmount - g.savedAmount);
  let need: number | null = null;
  if (g.status !== 'CANCELED') {
    if (remaining === 0) need = 0;
    else if (g.deadline) {
      const ms = new Date(g.deadline).getTime() - Date.now();
      need = ms <= 0 ? remaining : Math.ceil(remaining / Math.max(1, Math.ceil(ms / (30.4375 * DAY))));
    }
  }
  return {
    id: g.id, name: g.name, targetAmount: g.targetAmount, savedAmount: g.savedAmount, remainingAmount: remaining, percent: g.targetAmount ? Math.floor((g.savedAmount * 10000) / g.targetAmount) / 100 : 0,
    deadline: g.deadline, walletId: g.walletId, status: g.status, requiredMonthlySaving: need, createdAt: g.createdAt, updatedAt: g.updatedAt,
  };
};
const recurringView = (r: (typeof db.recurring)[number]) => ({ id: r.id, walletId: r.walletId, categoryId: r.categoryId, type: r.type, amount: r.amount, note: r.note, frequency: r.frequency, interval: r.interval, nextRunAt: r.nextRunAt, endAt: r.endAt, createdAt: r.createdAt, updatedAt: r.updatedAt });

/** Free plan: the current period and the 5 before it */
function historyGuard(u: UserRec, period?: string): Response | null {
  const months = limitsOf(u).history_months;
  if (months === null || !period) return null;
  const b = boundsFor(u.id, period);
  const oldest = shiftPeriodStart(currentBudgetPeriod(new Date(), u.monthStartDay).periodStart, -(months - 1));
  return b.periodStart < oldest ? fail(403, 'PLAN_LIMIT_REACHED', `Your plan includes ${months} months of report history`, { key: 'history_months', limit: months, oldestPeriod: formatPeriod(oldest) }) : null;
}

function recordTxn(u: UserRec, t: Omit<TxnRec, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'receiptKey' | 'recurringRuleId' | 'source'> & Partial<TxnRec>): TxnRec {
  const ts = iso(Date.now());
  const rec: TxnRec = { id: uuid(), userId: u.id, receiptKey: null, recurringRuleId: null, source: 'MANUAL', createdAt: ts, updatedAt: ts, deletedAt: null, ...t };
  db.txns.push(rec);
  return rec;
}

export const handlers = [
  // ---------------- health ----------------
  http.get(`${API_URL.replace(/\/api\/v1$/, '')}/health`, () => HttpResponse.json({ status: 'ok' })),

  // ---------------- auth ----------------
  route('post', '/auth/register', { public: true, schema: RegisterSchema }, ({ body }) => {
    if (db.users.some((u) => u.email === body.email)) return fail(409, 'EMAIL_TAKEN', 'Email already registered');
    const u: UserRec = { id: uuid(), email: body.email, password: body.password, fullName: body.fullName, avatarUrl: null, role: 'USER', status: 'ACTIVE', locale: 'vi', currency: 'VND', monthStartDay: 1, plan: 'FREE', onboarded: false, createdAt: iso(Date.now()), verifiedAt: null, settings: { inApp: true, email: true, weeklySummary: true, goalReminders: true } };
    db.users.push(u);
    db.outbox.push({ to: u.email, kind: 'verify', token: `mock-verify-${u.id}`, at: iso(Date.now()) });
    return json({ id: u.id, email: u.email, fullName: u.fullName }, 201);
  }),
  route('post', '/auth/verify-email', { public: true, schema: VerifyEmailSchema }, ({ body }) => {
    const u = db.users.find((x) => `mock-verify-${x.id}` === body.token);
    if (!u) return fail(400, 'INVALID_TOKEN', 'This link is invalid or has expired');
    u.verifiedAt = u.verifiedAt ?? iso(Date.now());
    return noContent();
  }),
  (() => {
    const fails = new Map<string, number>();
    return route('post', '/auth/login', { public: true, schema: LoginSchema }, ({ body }) => {
      const u = db.users.find((x) => x.email === body.email);
      if (!u) return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      if ((fails.get(u.id) ?? 0) >= 5) return fail(403, 'ACCOUNT_LOCKED', 'Account is locked. Try again in 15 minutes.');
      if (u.password !== body.password) { fails.set(u.id, (fails.get(u.id) ?? 0) + 1); return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'); }
      if (u.verifiedAt === null) return fail(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email first');
      fails.delete(u.id);
      setRefreshUser(u.id); // stands in for the httpOnly refresh cookie
      return json({ accessToken: issueToken(u.id), expiresIn: 900 });
    });
  })(),
  route('post', '/auth/refresh', { public: true }, () => {
    const id = refreshUser();
    const u = id && db.users.find((x) => x.id === id && x.status === 'ACTIVE');
    return u ? json({ accessToken: issueToken(u.id), expiresIn: 900 }) : fail(401, 'UNAUTHORIZED', 'Unauthorized');
  }),
  route('post', '/auth/logout', { public: true }, () => { setRefreshUser(null); return noContent(); }),
  route('post', '/auth/forgot-password', { public: true, schema: ForgotPasswordSchema }, ({ body }) => {
    const u = db.users.find((x) => x.email === body.email); // same 204 whether or not the account exists (no enumeration)
    if (u) db.outbox.push({ to: u.email, kind: 'reset', token: `mock-reset-${u.id}`, at: iso(Date.now()) });
    return noContent();
  }),
  route('post', '/auth/reset-password', { public: true, schema: ResetPasswordSchema }, ({ body }) => {
    const i = db.outbox.findIndex((m) => m.kind === 'reset' && m.token === body.token);
    const u = i >= 0 && db.users.find((x) => `mock-reset-${x.id}` === body.token);
    if (!u) return fail(400, 'INVALID_TOKEN', 'This link is invalid or has expired'); // single use, like the real fingerprinted link
    u.password = body.password;
    db.outbox.splice(i, 1);
    return noContent();
  }),
  route('get', '/auth/google', { public: true }, () => fail(501, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured')),
  route('get', '/auth/google/callback', { public: true }, () => fail(501, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured')),

  // ---------------- me ----------------
  route('get', '/me', ({ user }) => json(meView(user))),
  route('patch', '/me', { schema: UpdateProfileSchema }, ({ user, body }) => { Object.assign(user, body); return json(meView(user)); }),
  route('delete', '/me', { schema: DeleteAccountSchema }, ({ user, body }) => {
    if (body.password !== user.password) return fail(403, 'INVALID_PASSWORD', 'Password confirmation failed');
    user.status = 'LOCKED';
    setRefreshUser(null);
    return noContent();
  }),
  route('post', '/me/onboarding', { schema: OnboardingSchema }, ({ user, body }) => {
    if (db.wallets.some((w) => w.userId === user.id && !w.deletedAt)) return fail(409, 'ONBOARDING_DONE', 'Onboarding already completed');
    const ts = iso(Date.now());
    const w = { id: uuid(), userId: user.id, name: body.wallet.name, type: body.wallet.type, openingBalance: body.wallet.openingBalance, currency: 'VND', color: null, isArchived: false, createdAt: ts, updatedAt: ts, deletedAt: null };
    db.wallets.push(w);
    const periodStart = boundsFor(user.id).periodStart;
    const created: BudgetRec[] = [];
    if (body.template !== 'NONE') {
      const groups = BUDGET_TEMPLATES[body.template as '50_30_20' | '6_JARS'];
      const spend = groups.filter((g) => g.categories.length);
      const total = Math.floor((body.monthlyIncome * spend.reduce((a, g) => a + g.percent, 0)) / 100 / 1000) * 1000;
      const mk = (categoryId: string | null, limit: number) => { const b: BudgetRec = { id: uuid(), userId: user.id, period: iso(periodStart), categoryId, limitAmount: limit, rolloverMode: 'NONE', rolloverAmount: 0, alertThresholds: [80, 100], createdAt: ts, updatedAt: ts, deletedAt: null }; db.budgets.push(b); created.push(b); };
      mk(null, total);
      const cap = limitsOf(user).max_budgets;
      for (const g of spend) for (const name of g.categories) {
        if (cap !== null && created.length >= cap) break;
        mk(CAT[name], Math.floor((body.monthlyIncome * g.percent) / 100 / g.categories.length / 1000) * 1000);
      }
    }
    return json({ wallet: walletView(w), budgets: created.map(budgetView) }, 201);
  }),

  // ---------------- wallets ----------------
  route('get', '/wallets', { schema: ListWalletsQuerySchema }, ({ user, body }) =>
    json(db.wallets.filter((w) => w.userId === user.id && !w.deletedAt && (body.includeArchived || !w.isArchived)).map(walletView))),
  route('post', '/wallets', { schema: CreateWalletSchema }, ({ user, body }) => {
    const cap = limitsOf(user).max_wallets;
    if (cap !== null && planInfoUsage(user).wallets >= cap) return planLimit('max_wallets', cap);
    const ts = iso(Date.now());
    const w = { id: uuid(), userId: user.id, name: body.name, type: body.type, openingBalance: body.openingBalance, currency: body.currency, color: body.color ?? null, isArchived: false, createdAt: ts, updatedAt: ts, deletedAt: null };
    db.wallets.push(w);
    return json(walletView(w), 201);
  }),
  route('get', '/wallets/:id', ({ user, params }) => { const w = ownWallet(user, params.id); return w ? json(walletView(w)) : notFound(); }),
  route('patch', '/wallets/:id', { schema: UpdateWalletSchema }, ({ user, params, body }) => {
    const w = ownWallet(user, params.id);
    if (!w) return notFound();
    if (body.isArchived === false && w.isArchived) { const cap = limitsOf(user).max_wallets; if (cap !== null && planInfoUsage(user).wallets >= cap) return planLimit('max_wallets', cap); }
    Object.assign(w, body, { updatedAt: iso(Date.now()) });
    return json(walletView(w));
  }),
  route('delete', '/wallets/:id', ({ user, params }) => {
    const w = ownWallet(user, params.id);
    if (!w) return notFound();
    const ts = iso(Date.now());
    w.deletedAt = ts;
    for (const t of db.txns) if (!t.deletedAt && (t.walletId === w.id || t.transferWalletId === w.id)) t.deletedAt = ts;
    return noContent();
  }),

  // ---------------- transactions ----------------
  route('get', '/transactions', { schema: TransactionQuerySchema }, ({ user, body: q }) => {
    const norm = q.q ? normalizeText(q.q) : null; // accent-insensitive in the mock (docs/backend-requests.md #16)
    const to = q.to ? (/^\d{4}-\d{2}-\d{2}$/.test(q.to) ? new Date(`${q.to}T23:59:59.999+07:00`) : new Date(q.to)) : null;
    const from = q.from ? (/^\d{4}-\d{2}-\d{2}$/.test(q.from) ? new Date(`${q.from}T00:00:00+07:00`) : new Date(q.from)) : null;
    let rows = userTxns(user.id).filter((t) =>
      (!q.type || t.type === q.type) && (!q.categoryId || t.categoryId === q.categoryId) && (!q.walletId || t.walletId === q.walletId || t.transferWalletId === q.walletId) &&
      (q.minAmount === undefined || t.amount >= q.minAmount) && (q.maxAmount === undefined || t.amount <= q.maxAmount) && (!from || new Date(t.occurredAt) >= from) && (!to || new Date(t.occurredAt) <= to) &&
      (!norm || normalizeText(t.note ?? '').includes(norm)));
    const [field, dir] = q.sort.split(':');
    rows = rows.sort((a, b) => (field === 'amount' ? a.amount - b.amount : a.occurredAt.localeCompare(b.occurredAt)) * (dir === 'asc' ? 1 : -1));
    return json(rows.slice((q.page - 1) * q.limit, q.page * q.limit).map(txnView), 200, { page: q.page, limit: q.limit, total: rows.length });
  }),
  route('post', '/transactions', { schema: CreateTransactionSchema }, ({ user, body }) => {
    const w = usable(user, body.walletId);
    if (!w) return notFound();
    if (w === 'archived') return fail(409, 'WALLET_ARCHIVED', 'Archived wallets cannot receive new transactions');
    if (body.categoryId) {
      const c = visibleCategory(user, body.categoryId);
      if (!c) return notFound();
      if (c.type !== body.type) return fail(422, 'CATEGORY_TYPE_MISMATCH', `A ${c.type} category cannot be used on a ${body.type} transaction`);
    }
    const t = recordTxn(user, { walletId: body.walletId, transferWalletId: null, categoryId: body.categoryId ?? null, type: body.type, amount: body.amount, occurredAt: body.occurredAt, note: body.note ?? null, receiptKey: body.receiptKey ?? null });
    return json({ ...txnView(t), triggeredAlerts: evaluateAlerts(user.id, t, null) }, 201);
  }),
  route('post', '/transactions/transfer', { schema: TransferSchema }, ({ user, body }) => {
    const a = usable(user, body.fromWalletId), b = usable(user, body.toWalletId);
    if (!a || !b) return notFound();
    if (a === 'archived' || b === 'archived') return fail(409, 'WALLET_ARCHIVED', 'Archived wallets cannot receive new transactions');
    return json(txnView(recordTxn(user, { walletId: body.fromWalletId, transferWalletId: body.toWalletId, categoryId: null, type: 'TRANSFER', amount: body.amount, occurredAt: body.occurredAt, note: body.note ?? null })), 201);
  }),
  route('post', '/transactions/receipts/upload-url', { schema: ReceiptUploadSchema }, ({ user, body }) => {
    const key = `receipts/${user.id}/${uuid()}.${body.contentType.split('/')[1]}`;
    return json({ key, url: 'https://receipts.smartwallet.demo/upload', fields: { key, 'Content-Type': body.contentType }, maxBytes: 5 * 1024 * 1024, expiresIn: 300 }, 201);
  }),
  route('post', '/transactions/import', { form: true }, async ({ user, req }) => {
    if (user.plan !== 'PREMIUM') return premiumOnly('csv_import');
    const form = await req.formData();
    const file = form.get('file');
    const walletId = String(form.get('walletId') ?? '');
    const w = usable(user, walletId);
    if (!w) return notFound();
    if (w === 'archived') return fail(409, 'WALLET_ARCHIVED', 'Archived wallets cannot receive new transactions');
    if (!(file instanceof Blob)) return fail(415, 'FILE_REQUIRED', 'Send the CSV as multipart field "file"');
    const lines = (await file.text()).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return fail(422, 'INVALID_CSV', 'CSV needs a header row and at least one data row');
    const delim = lines[0].includes(';') ? ';' : ',';
    const rows = lines.slice(1).map((line, i) => {
      const [d, a, ...rest] = line.split(delim).map((x) => x.trim());
      const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(d ?? '') ?? null;
      const date = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 5)) : /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? new Date(`${d}T12:00:00+07:00`) : null;
      const raw = Number((a ?? '').replace(/[^\d-]/g, ''));
      const amount = Math.abs(raw);
      const errors: string[] = [];
      if (!date) errors.push('invalid date');
      if (!amount) errors.push('invalid amount');
      const note = rest.join(' ').trim() || null;
      const type = (raw < 0 ? 'EXPENSE' : 'INCOME') as 'INCOME' | 'EXPENSE';
      const dup = !!date && userTxns(user.id).some((t) => t.walletId === walletId && t.type === type && t.amount === amount && t.occurredAt.slice(0, 10) === date.toISOString().slice(0, 10));
      const cat = note ? suggestFor(user.id, note, amount, type).preselectedCategoryId : null;
      return { line: i + 2, date: date ? iso(date) : null, amount: amount || null, type: errors.length ? null : type, note, categoryId: cat, duplicate: dup, errors };
    });
    const importId = uuid();
    db.imports.set(importId, { userId: user.id, walletId, rows: rows.filter((r) => !r.errors.length).map((r) => ({ line: r.line, occurredAt: r.date!, amount: r.amount!, type: r.type!, note: r.note, categoryId: r.categoryId, duplicate: r.duplicate })) });
    return json({ importId, walletId, expiresIn: 1800, rows, summary: { total: rows.length, valid: rows.filter((r) => !r.errors.length).length, duplicates: rows.filter((r) => r.duplicate).length, errors: rows.filter((r) => r.errors.length).length } });
  }),
  route('post', '/transactions/import/:importId/confirm', { schema: ConfirmImportSchema }, ({ user, params, body }) => {
    if (user.plan !== 'PREMIUM') return premiumOnly('csv_import');
    const imp = db.imports.get(params.importId);
    if (!imp || imp.userId !== user.id) return fail(404, 'IMPORT_NOT_FOUND', 'Import preview not found, expired or already confirmed');
    db.imports.delete(params.importId);
    const skip = new Set(body.excludeLines);
    const chosen = imp.rows.filter((r) => !skip.has(r.line) && (body.includeDuplicates || !r.duplicate));
    const made = chosen.map((r) => recordTxn(user, { walletId: imp.walletId, transferWalletId: null, categoryId: r.categoryId, type: r.type, amount: r.amount, occurredAt: r.occurredAt, note: r.note, source: 'IMPORT' }));
    return json({ imported: made.length, skipped: imp.rows.length - made.length, transactionIds: made.map((t) => t.id) });
  }),
  route('get', '/transactions/:id', ({ user, params }) => { const t = userTxns(user.id).find((x) => x.id === params.id); return t ? json(txnView(t)) : notFound(); }),
  route('patch', '/transactions/:id', { schema: UpdateTransactionSchema }, ({ user, params, body }) => {
    const t = userTxns(user.id).find((x) => x.id === params.id);
    if (!t) return notFound();
    if (t.type === 'TRANSFER' && (body.walletId || body.categoryId !== undefined || body.type || body.receiptKey !== undefined)) return fail(422, 'TRANSFER_FIELDS_IMMUTABLE', 'A transfer only allows amount, note and occurredAt to change');
    if (body.walletId && body.walletId !== t.walletId) { const w = usable(user, body.walletId); if (!w) return notFound(); if (w === 'archived') return fail(409, 'WALLET_ARCHIVED', 'Archived wallet'); }
    const type = body.type ?? t.type;
    const categoryId = body.categoryId !== undefined ? body.categoryId : t.categoryId;
    if (type !== 'TRANSFER' && categoryId && (body.categoryId !== undefined || body.type)) { const c = visibleCategory(user, categoryId); if (!c) return notFound(); if (c.type !== type) return fail(422, 'CATEGORY_TYPE_MISMATCH', 'Category type does not match'); }
    Object.assign(t, { ...(body.walletId ? { walletId: body.walletId } : {}), ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}), ...(body.type ? { type: body.type } : {}), ...(body.amount !== undefined ? { amount: body.amount } : {}), ...(body.note !== undefined ? { note: body.note } : {}), ...(body.occurredAt ? { occurredAt: body.occurredAt } : {}), ...(body.receiptKey !== undefined ? { receiptKey: body.receiptKey } : {}), updatedAt: iso(Date.now()) });
    return json(txnView(t));
  }),
  route('delete', '/transactions/:id', ({ user, params }) => { const t = userTxns(user.id).find((x) => x.id === params.id); if (!t) return notFound(); t.deletedAt = iso(Date.now()); return noContent(); }),

  // ---------------- categories ----------------
  route('get', '/categories', { schema: ListCategoriesQuerySchema }, ({ user, body }) => json(categoriesFor(user.id).filter((c) => !body.type || c.type === body.type))),
  route('post', '/categories/suggest', { schema: SuggestCategoryBodySchema }, ({ user, body }) => json(suggestFor(user.id, body.note, body.amount, body.type))),
  route('post', '/categories', { schema: CreateCategorySchema }, ({ user, body }) => {
    if (body.parentId) {
      const p = visibleCategory(user, body.parentId);
      if (!p) return notFound();
      if (p.parentId) return fail(422, 'CATEGORY_DEPTH_EXCEEDED', 'Categories can be nested at most 2 levels');
      if (p.type !== body.type) return fail(422, 'CATEGORY_TYPE_MISMATCH', 'A sub-category must have the same type as its parent');
    }
    const c = { id: uuid(), userId: user.id, parentId: body.parentId ?? null, nameVi: body.nameVi, nameEn: body.nameEn, type: body.type, icon: body.icon ?? null, color: body.color ?? null };
    db.categories.push(c);
    return json({ id: c.id, isSystem: false, parentId: c.parentId, nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, icon: c.icon, color: c.color }, 201);
  }),
  route('patch', '/categories/:id', { schema: UpdateCategorySchema }, ({ user, params, body }) => {
    if (SYSTEM_CATEGORIES.some((c) => c.id === params.id)) return fail(403, 'SYSTEM_CATEGORY_READONLY', 'Default categories cannot be changed or deleted');
    const c = db.categories.find((x) => x.id === params.id && x.userId === user.id);
    if (!c) return notFound();
    Object.assign(c, body);
    return json({ id: c.id, isSystem: false, parentId: c.parentId, nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, icon: c.icon, color: c.color });
  }),
  route('delete', '/categories/:id', ({ user, params }) => {
    if (SYSTEM_CATEGORIES.some((c) => c.id === params.id)) return fail(403, 'SYSTEM_CATEGORY_READONLY', 'Default categories cannot be changed or deleted');
    const i = db.categories.findIndex((x) => x.id === params.id && x.userId === user.id);
    if (i < 0) return notFound();
    db.categories.splice(i, 1);
    return noContent();
  }),

  // ---------------- recurring rules ----------------
  route('get', '/recurring-rules', ({ user }) => json(db.recurring.filter((r) => r.userId === user.id && !r.deletedAt).map(recurringView))),
  route('post', '/recurring-rules', { schema: CreateRecurringRuleSchema }, ({ user, body }) => {
    const w = usable(user, body.walletId);
    if (!w) return notFound();
    if (w === 'archived') return fail(409, 'WALLET_ARCHIVED', 'Archived wallet');
    const ts = iso(Date.now());
    const r = { id: uuid(), userId: user.id, walletId: body.walletId, categoryId: body.categoryId ?? null, type: body.type, amount: body.amount, note: body.note ?? null, frequency: body.frequency, interval: body.interval, nextRunAt: body.nextRunAt, endAt: body.endAt ?? null, createdAt: ts, updatedAt: ts, deletedAt: null };
    db.recurring.push(r);
    return json(recurringView(r), 201);
  }),
  route('patch', '/recurring-rules/:id', { schema: UpdateRecurringRuleSchema }, ({ user, params, body }) => {
    const r = db.recurring.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt);
    if (!r) return notFound();
    Object.assign(r, body, { updatedAt: iso(Date.now()) });
    return json(recurringView(r));
  }),
  route('delete', '/recurring-rules/:id', ({ user, params }) => { const r = db.recurring.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt); if (!r) return notFound(); r.deletedAt = iso(Date.now()); return noContent(); }),

  // ---------------- budgets ----------------
  route('get', '/budgets', { schema: ListBudgetsQuerySchema }, ({ user, body }) => json(budgetsOfPeriod(user.id, boundsFor(user.id, body.period).periodStart).map(budgetView))),
  route('post', '/budgets', { schema: CreateBudgetSchema }, ({ user, body }) => {
    const b = boundsFor(user.id, body.period);
    const cap = limitsOf(user).max_budgets;
    if (cap !== null && budgetsOfPeriod(user.id, b.periodStart).length >= cap) return planLimit('max_budgets', cap);
    if (body.alertThresholds && user.plan !== 'PREMIUM') return premiumOnly('alert_thresholds');
    if (body.categoryId) { const c = categoriesFor(user.id).find((x) => x.id === body.categoryId && x.type === 'EXPENSE'); if (!c) return notFound(); }
    if (budgetsOfPeriod(user.id, b.periodStart).some((x) => x.categoryId === (body.categoryId ?? null))) return fail(409, 'BUDGET_EXISTS', 'A budget already exists for this category and period');
    const ts = iso(Date.now());
    const rec: BudgetRec = { id: uuid(), userId: user.id, period: iso(b.periodStart), categoryId: body.categoryId, limitAmount: body.limitAmount, rolloverMode: body.rolloverMode ?? 'NONE', rolloverAmount: 0, alertThresholds: body.alertThresholds ?? [80, 100], createdAt: ts, updatedAt: ts, deletedAt: null };
    db.budgets.push(rec);
    return json(budgetView(rec), 201);
  }),
  route('post', '/budgets/apply-template', { schema: ApplyTemplateSchema }, ({ user, body }) => {
    const b = boundsFor(user.id, body.period);
    const groups = body.template === 'CUSTOM' ? body.groups!.map((g: any) => ({ percent: g.percent, ids: g.categoryIds as string[] })) : BUDGET_TEMPLATES[body.template as '50_30_20' | '6_JARS'].map((g) => ({ percent: g.percent, ids: g.categories.map((n) => CAT[n]).filter(Boolean) }));
    const items: { id: string | null; limit: number }[] = [];
    let total = 0, reserved = 0;
    for (const g of groups) {
      const amount = Math.floor((body.monthlyIncome * g.percent) / 100 / 1000) * 1000;
      if (!g.ids.length) { reserved += amount; continue; }
      total += amount;
      const each = Math.floor(amount / g.ids.length / 1000) * 1000;
      g.ids.forEach((id: string, i: number) => items.push({ id, limit: i === 0 ? amount - each * (g.ids.length - 1) : each }));
    }
    const wanted = [{ id: null as string | null, limit: total }, ...items.sort((a, c) => c.limit - a.limit)].filter((x) => x.limit > 0);
    const cap = limitsOf(user).max_budgets;
    let created = 0, updated = 0, skipped = 0, truncated = 0;
    for (const w of wanted) {
      const cur = budgetsOfPeriod(user.id, b.periodStart).find((x) => x.categoryId === w.id);
      if (cur) { if (body.overwrite) { cur.limitAmount = w.limit; updated++; } else skipped++; }
      else if (cap !== null && budgetsOfPeriod(user.id, b.periodStart).length >= cap) truncated++;
      else { const ts = iso(Date.now()); db.budgets.push({ id: uuid(), userId: user.id, period: iso(b.periodStart), categoryId: w.id, limitAmount: w.limit, rolloverMode: 'NONE', rolloverAmount: 0, alertThresholds: [80, 100], createdAt: ts, updatedAt: ts, deletedAt: null }); created++; }
    }
    return json({ period: b.label, template: body.template, totalBudget: total, reservedForSavings: reserved, created, updated, skipped, truncatedByPlan: truncated, budgets: budgetsOfPeriod(user.id, b.periodStart).map(budgetView) });
  }),
  route('post', '/budgets/rollover', { schema: RolloverSchema }, ({ user, body }) => {
    const target = boundsFor(user.id, body.period);
    const prevStart = shiftPeriodStart(target.periodStart, -1);
    const prevB = periodBounds(prevStart);
    const cap = limitsOf(user).max_budgets;
    let created = 0, updated = 0, skipped = 0, skippedPlan = 0, carried = 0;
    for (const p of budgetsOfPeriod(user.id, prevStart)) {
      const used = spentFor(user.id, p.categoryId, prevB.startsAt, prevB.endsAt);
      const carry = p.rolloverMode === 'CARRY_FORWARD';
      const left = carry && p.limitAmount > used ? p.limitAmount - used : 0;
      const cur = budgetsOfPeriod(user.id, target.periodStart).find((x) => x.categoryId === p.categoryId);
      if (cur) { if (!carry) { skipped++; continue; } cur.limitAmount = cur.limitAmount - cur.rolloverAmount + left; carried += Math.max(0, left - cur.rolloverAmount); cur.rolloverAmount = left; updated++; }
      else if (cap !== null && budgetsOfPeriod(user.id, target.periodStart).length >= cap) skippedPlan++;
      else { const ts = iso(Date.now()); db.budgets.push({ ...p, id: uuid(), period: iso(target.periodStart), limitAmount: p.limitAmount - p.rolloverAmount + left, rolloverAmount: left, createdAt: ts, updatedAt: ts }); carried += left; created++; }
    }
    return json({ period: target.label, from: formatPeriod(prevStart), created, updated, skipped, skippedForPlanLimit: skippedPlan, carriedOver: carried, budgets: budgetsOfPeriod(user.id, target.periodStart).map(budgetView) });
  }),
  route('patch', '/budgets/:id', { schema: UpdateBudgetSchema }, ({ user, params, body }) => {
    const b = db.budgets.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt);
    if (!b) return notFound();
    if (body.alertThresholds && user.plan !== 'PREMIUM') return premiumOnly('alert_thresholds');
    Object.assign(b, body, { updatedAt: iso(Date.now()) });
    return json(budgetView(b));
  }),
  route('delete', '/budgets/:id', ({ user, params }) => { const b = db.budgets.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt); if (!b) return notFound(); b.deletedAt = iso(Date.now()); return noContent(); }),

  // ---------------- goals ----------------
  route('get', '/goals', ({ user }) => json(db.goals.filter((g) => g.userId === user.id && !g.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(goalView))),
  route('post', '/goals', { schema: CreateGoalSchema }, ({ user, body }) => {
    const cap = limitsOf(user).max_goals;
    if (cap !== null && planInfoUsage(user).goals >= cap) return planLimit('max_goals', cap);
    const ts = iso(Date.now());
    const g: GoalRec = { id: uuid(), userId: user.id, name: body.name, targetAmount: body.targetAmount, savedAmount: 0, deadline: body.deadline ?? null, walletId: body.walletId ?? null, status: 'ACTIVE', createdAt: ts, updatedAt: ts, deletedAt: null };
    db.goals.push(g);
    return json(goalView(g), 201);
  }),
  route('patch', '/goals/:id', { schema: UpdateGoalSchema }, ({ user, params, body }) => {
    const g = db.goals.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt);
    if (!g) return notFound();
    if (g.status === 'CANCELED' && body.status === 'ACTIVE') { const cap = limitsOf(user).max_goals; if (cap !== null && planInfoUsage(user).goals >= cap) return planLimit('max_goals', cap); }
    const target = body.targetAmount ?? g.targetAmount;
    Object.assign(g, { ...(body.name ? { name: body.name } : {}), targetAmount: target, ...(body.deadline !== undefined ? { deadline: body.deadline } : {}), ...(body.walletId !== undefined ? { walletId: body.walletId } : {}), updatedAt: iso(Date.now()) });
    if (body.status === 'CANCELED') g.status = 'CANCELED';
    else if (body.status === 'ACTIVE' || body.targetAmount !== undefined) { if (g.status !== 'CANCELED' || body.status === 'ACTIVE') g.status = g.savedAmount >= target ? 'ACHIEVED' : 'ACTIVE'; }
    return json(goalView(g));
  }),
  route('delete', '/goals/:id', ({ user, params }) => { const g = db.goals.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt); if (!g) return notFound(); g.deletedAt = iso(Date.now()); return noContent(); }),
  route('post', '/goals/:id/contributions', { schema: ContributionSchema }, ({ user, params, body }) => {
    const g = db.goals.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt);
    if (!g) return notFound();
    if (g.status === 'CANCELED') return fail(409, 'GOAL_NOT_ACTIVE', 'Canceled goals cannot receive contributions');
    if (body.amount < 0 && g.savedAmount < -body.amount) return fail(422, 'INSUFFICIENT_GOAL_BALANCE', 'Cannot withdraw more than has been saved');
    g.savedAmount += body.amount;
    g.status = g.savedAmount >= g.targetAmount ? 'ACHIEVED' : 'ACTIVE';
    const ts = iso(Date.now());
    const c = { id: uuid(), goalId: g.id, amount: body.amount, occurredAt: body.occurredAt ?? ts, note: body.note ?? null, createdAt: ts };
    db.contributions.push(c);
    return json({ contribution: c, goal: goalView(g) }, 201);
  }),

  // ---------------- notifications ----------------
  route('get', '/notifications', { schema: NotificationQuerySchema }, ({ user, body: q }) => {
    const rows = db.notifications.filter((n) => n.userId === user.id && (!q.unread || !n.readAt)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(rows.slice((q.page - 1) * q.limit, q.page * q.limit).map((n) => notificationView(n, user.locale)), 200, { page: q.page, limit: q.limit, total: rows.length });
  }),
  route('post', '/notifications/read-all', ({ user }) => {
    const now = iso(Date.now());
    const unread = db.notifications.filter((n) => n.userId === user.id && !n.readAt);
    unread.forEach((n) => (n.readAt = now));
    return json(ReadAllOut.parse({ updated: unread.length }));
  }),
  route('patch', '/notifications/:id/read', ({ user, params }) => {
    const n = db.notifications.find((x) => x.id === params.id && x.userId === user.id);
    if (!n) return notFound();
    n.readAt ??= iso(Date.now());
    return json(notificationView(n, user.locale));
  }),
  route('get', '/notification-settings', ({ user }) => json(user.settings)),
  route('patch', '/notification-settings', { schema: UpdateNotificationSettingsSchema }, ({ user, body }) => { Object.assign(user.settings, body); return json(user.settings); }),

  // ---------------- reports ----------------
  route('get', '/reports/dashboard', { schema: ReportPeriodQuerySchema }, ({ user, body }) => {
    const guard = historyGuard(user, body.period);
    if (guard) return guard;
    const b = boundsFor(user.id, body.period);
    const wallets = db.wallets.filter((w) => w.userId === user.id && !w.deletedAt && !w.isArchived).map(walletView);
    const months = limitsOf(user).history_months === null ? 6 : Math.min(6, limitsOf(user).history_months!);
    return json({
      period: { label: b.label, start: iso(b.startsAt), end: iso(b.endsAt), daysLeft: computeProgress(1, 0, new Date(), b.startsAt, b.endsAt).daysLeft },
      totals: totalsFor(user.id, b.startsAt, b.endsAt),
      wallets: { total: wallets.reduce((a, w) => a + w.balance, 0), items: wallets.map((w) => ({ id: w.id, name: w.name, type: w.type, balance: w.balance })) },
      budgets: budgetsOfPeriod(user.id, b.periodStart).map(budgetView),
      topCategories: byCategoryFor(user.id, b.startsAt, b.endsAt, 'EXPENSE').items.slice(0, 5),
      dailySpending: dailyFor(user.id, b), trend: trendFor(user.id, months),
      goals: db.goals.filter((g) => g.userId === user.id && !g.deletedAt && g.status === 'ACTIVE').map(goalView),
      recentTransactions: userTxns(user.id).sort((a, c) => c.occurredAt.localeCompare(a.occurredAt)).slice(0, 5).map(txnView),
      generatedAt: iso(Date.now()),
    });
  }),
  route('get', '/reports/by-category', { schema: ByCategoryQuerySchema }, ({ user, body }) => {
    const guard = historyGuard(user, body.period);
    if (guard) return guard;
    const b = boundsFor(user.id, body.period);
    return json({ period: { label: b.label, start: iso(b.startsAt), end: iso(b.endsAt), daysLeft: computeProgress(1, 0, new Date(), b.startsAt, b.endsAt).daysLeft }, type: body.type, ...byCategoryFor(user.id, b.startsAt, b.endsAt, body.type) });
  }),
  route('get', '/reports/trend', { schema: TrendQuerySchema }, ({ user, body }) => {
    const cap = limitsOf(user).history_months;
    if (cap !== null && body.months > cap) return fail(403, 'PLAN_LIMIT_REACHED', `Your plan includes ${cap} months of report history`, { key: 'history_months', limit: cap });
    return json({ months: body.months, points: trendFor(user.id, body.months) });
  }),
  route('get', '/reports/daily', { schema: ReportPeriodQuerySchema }, ({ user, body }) => {
    const guard = historyGuard(user, body.period);
    if (guard) return guard;
    const b = boundsFor(user.id, body.period);
    return json({ period: { label: b.label, start: iso(b.startsAt), end: iso(b.endsAt), daysLeft: computeProgress(1, 0, new Date(), b.startsAt, b.endsAt).daysLeft }, days: dailyFor(user.id, b) });
  }),
  route('get', '/reports/export', { schema: ExportQuerySchema }, ({ user, body }) => {
    if (user.plan !== 'PREMIUM') return premiumOnly('csv_export');
    const b = boundsFor(user.id, body.period);
    const wName = new Map(db.wallets.map((w) => [w.id, w.name]));
    const cName = new Map(categoriesFor(user.id).map((c) => [c.id, user.locale === 'en' ? c.nameEn : c.nameVi]));
    const cell = (v: unknown) => { const s = String(v ?? ''); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
    const lines = ['date,type,amount,wallet,to_wallet,category,note,source', ...userTxns(user.id).filter((t) => new Date(t.occurredAt) >= b.startsAt && new Date(t.occurredAt) < b.endsAt).sort((a, c) => a.occurredAt.localeCompare(c.occurredAt))
      .map((t) => [new Date(new Date(t.occurredAt).getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace('T', ' '), t.type, t.amount, wName.get(t.walletId), t.transferWalletId ? wName.get(t.transferWalletId) : '', t.categoryId ? cName.get(t.categoryId) : '', t.note, t.source].map(cell).join(','))];
    return new HttpResponse(`﻿${lines.join('\r\n')}\r\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="smartwallet-${b.label}.csv"` } });
  }),

  // ---------------- subscriptions + admin ----------------
  route('post', '/subscriptions/mock-checkout', ({ user }) => { user.plan = 'PREMIUM'; return json({ plan: 'PREMIUM', currentPeriodEnd: iso(Date.now() + 30 * DAY) }); }),
  route('get', '/admin/stats', { admin: true }, () => json({ users: db.users.length, premium: db.users.filter((u) => u.plan === 'PREMIUM').length })),
  route('get', '/admin/users', { admin: true }, () => json(db.users.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role, status: u.status, plan: u.plan, createdAt: u.createdAt })))),

  ...extraHandlers({ route, json, fail, notFound, planInfoUsage, goalView }),
];

// helper used by rollover (sums spent for any period window, including sub-categories)
import { spentInRange as spentFor } from './logic';
void FREE_LIMITS; void mockBus; void DEMO; void walletBalance;
export type { Ctx, Handler };
export const _route = route;

import { currentBudgetPeriod, formatPeriod, normalizeText, periodBounds, periodFromMonth } from '@smartwallet/shared';
import { z } from 'zod';
import { db, GLOBAL_RULES, iso, SYSTEM_CATEGORIES, uuid } from './db';
import { FREE_LIMITS, PREMIUM_LIMITS, userTxns } from './logic';

/**
 * Endpoints the settings / plans / reports / admin screens need that the real API does not have yet (docs/backend-requests.md, "settings, plans, reports, admin").
 * MSW only. Each block says which request it stands for.
 */
interface Helpers {
  route: (...args: any[]) => any;
  json: (data: unknown, status?: number, meta?: unknown) => Response;
  fail: (status: number, code: string, message: string, details?: unknown) => Response;
  notFound: () => Response;
}
const noContent = () => new Response(null, { status: 204 });
const DAY = 86_400_000;

// ---- sessions (request: GET/DELETE /me/sessions): one "this device" row plus two older ones, per user, lazily
interface SessionRec { id: string; userId: string; device: string; place: string; lastActiveAt: string }
const sessions: SessionRec[] = [];
const sessionsOf = (userId: string) => {
  if (!sessions.some((s) => s.userId === userId)) {
    const now = Date.now();
    sessions.push(
      { id: uuid(), userId, device: 'Chrome trên Windows', place: 'TP. Hồ Chí Minh', lastActiveAt: iso(now) },
      { id: uuid(), userId, device: 'Safari trên iPhone', place: 'TP. Hồ Chí Minh', lastActiveAt: iso(now - 2 * DAY) },
      { id: uuid(), userId, device: 'Chrome trên Android', place: 'Hà Nội', lastActiveAt: iso(now - 9 * DAY) },
    );
  }
  return sessions.filter((s) => s.userId === userId);
};

// ---- default keyword rules, flattened from GLOBAL_RULES (request: /admin/category-rules)
const ruleId = (categoryId: string, keyword: string) => `${categoryId}|${keyword}`;
const ruleRows = () => Object.entries(GLOBAL_RULES).flatMap(([categoryId, kws]) => kws.map((keyword) => ({ id: ruleId(categoryId, keyword), keyword, categoryId, weight: 1 })));

const LimitsSchema = z.object({ max_wallets: z.number().int().positive().nullable(), max_budgets: z.number().int().positive().nullable(), max_goals: z.number().int().positive().nullable(), history_months: z.number().int().positive().nullable() }).strict();
const CategoryBody = z.object({ nameVi: z.string().trim().min(1).max(60), nameEn: z.string().trim().min(1).max(60), type: z.enum(['INCOME', 'EXPENSE']), icon: z.string().max(40).nullable().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() }).strict();

export function moreHandlers(h: Helpers) {
  const admin = { admin: true };
  return [
    // ---------------- settings: security ----------------
    // request #8: POST /me/password
    h.route('post', '/me/password', { schema: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(72).regex(/[A-Za-z]/).regex(/\d/) }).strict() }, ({ user, body }: any) => {
      if (user.password !== body.currentPassword) return h.fail(400, 'WRONG_PASSWORD', 'Current password is incorrect');
      user.password = body.newPassword;
      return noContent();
    }),
    // request: sessions list / revoke
    h.route('get', '/me/sessions', ({ user }: any) => h.json(sessionsOf(user.id).map((s, i) => ({ id: s.id, device: s.device, place: s.place, lastActiveAt: s.lastActiveAt, current: i === 0 })))),
    h.route('delete', '/me/sessions/:id', ({ user, params }: any) => {
      const list = sessionsOf(user.id);
      if (list[0].id === params.id) return h.fail(409, 'CURRENT_SESSION', 'Use log out for the current session');
      const i = sessions.findIndex((s) => s.id === params.id && s.userId === user.id);
      if (i < 0) return h.notFound();
      sessions.splice(i, 1);
      return noContent();
    }),
    h.route('post', '/me/sessions/revoke-others', ({ user }: any) => { const keep = sessionsOf(user.id)[0]; for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].userId === user.id && sessions[i].id !== keep.id) sessions.splice(i, 1); return noContent(); }),

    // ---------------- plans ----------------
    // request: cancel Premium (SUB-01 "cancel anytime")
    h.route('post', '/subscriptions/cancel', ({ user }: any) => { user.plan = 'FREE'; return h.json({ plan: 'FREE', currentPeriodEnd: null }); }),

    // ---------------- reports: top notes (request: GET /reports/top-notes) ----------------
    h.route('get', '/reports/top-notes', { schema: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional(), type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'), limit: z.coerce.number().int().min(1).max(20).default(8) }).strict() }, ({ user, body }: any) => {
      const start = body.period ? periodFromMonth(body.period, user.monthStartDay) : currentBudgetPeriod(new Date(), user.monthStartDay).periodStart;
      const { startsAt, endsAt } = periodBounds(start);
      const groups = new Map<string, { note: string; count: number; total: number }>();
      for (const t of userTxns(user.id)) {
        const at = new Date(t.occurredAt);
        if (t.type !== body.type || !t.note || at < startsAt || at >= endsAt) continue;
        const key = normalizeText(t.note);
        const g = groups.get(key) ?? { note: t.note, count: 0, total: 0 };
        g.count += 1; g.total += t.amount; groups.set(key, g);
      }
      return h.json({ period: formatPeriod(start), items: [...groups.values()].sort((a, b) => b.total - a.total).slice(0, body.limit) });
    }),

    // ---------------- admin (ADM-01) ----------------
    // request #5: PATCH /admin/users/:id
    h.route('patch', '/admin/users/:id', { ...admin, schema: z.object({ status: z.enum(['ACTIVE', 'LOCKED']).optional(), plan: z.enum(['FREE', 'PREMIUM']).optional() }).strict() }, ({ user, params, body }: any) => {
      const u = db.users.find((x) => x.id === params.id);
      if (!u) return h.notFound();
      if (u.id === user.id) return h.fail(409, 'CANNOT_MODIFY_SELF', 'You cannot change your own account here');
      if (u.role === 'ADMIN') return h.fail(409, 'CANNOT_MODIFY_ADMIN', 'Admin accounts cannot be changed here');
      Object.assign(u, body);
      return h.json({ id: u.id, email: u.email, fullName: u.fullName, role: u.role, status: u.status, plan: u.plan, createdAt: u.createdAt });
    }),
    // request: users over time
    h.route('get', '/admin/stats/growth', { ...admin, schema: z.object({ months: z.coerce.number().int().min(2).max(24).default(12) }).strict() }, ({ body }: any) => {
      const now = new Date();
      const pts = Array.from({ length: body.months }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (body.months - 1 - i), 1));
        const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
        const upTo = db.users.filter((u) => new Date(u.createdAt) < end);
        return { period: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, newUsers: upTo.filter((u) => new Date(u.createdAt) >= d).length, totalUsers: upTo.length, premium: upTo.filter((u) => u.plan === 'PREMIUM').length };
      });
      return h.json({ months: body.months, points: pts });
    }),
    // request #6: default categories + keywords
    h.route('get', '/admin/categories', admin, () => h.json(SYSTEM_CATEGORIES.map((c) => ({ id: c.id, nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, icon: c.icon, color: c.color, keywordCount: (GLOBAL_RULES[c.id] ?? []).length })))),
    h.route('post', '/admin/categories', { ...admin, schema: CategoryBody }, ({ body }: any) => {
      const c = { id: uuid(), nameVi: body.nameVi, nameEn: body.nameEn, type: body.type, icon: body.icon ?? 'tag', color: body.color ?? '#64748B' };
      SYSTEM_CATEGORIES.push(c as any);
      return h.json({ ...c, keywordCount: 0 }, 201);
    }),
    h.route('patch', '/admin/categories/:id', { ...admin, schema: CategoryBody.partial() }, ({ params, body }: any) => {
      const c = SYSTEM_CATEGORIES.find((x) => x.id === params.id);
      if (!c) return h.notFound();
      Object.assign(c, body);
      return h.json({ ...c, keywordCount: (GLOBAL_RULES[c.id] ?? []).length });
    }),
    h.route('delete', '/admin/categories/:id', admin, ({ params }: any) => {
      const i = SYSTEM_CATEGORIES.findIndex((x) => x.id === params.id);
      if (i < 0) return h.notFound();
      // users' past transactions keep their category id (same rule as user categories); the default simply disappears from pickers
      SYSTEM_CATEGORIES.splice(i, 1);
      delete GLOBAL_RULES[params.id];
      return noContent();
    }),
    h.route('get', '/admin/category-rules', admin, () => h.json(ruleRows())),
    h.route('post', '/admin/category-rules', { ...admin, schema: z.object({ keyword: z.string().trim().min(2).max(40), categoryId: z.string().uuid() }).strict() }, ({ body }: any) => {
      if (!SYSTEM_CATEGORIES.some((c) => c.id === body.categoryId)) return h.fail(404, 'NOT_FOUND', 'Category not found');
      const kw = normalizeText(body.keyword);
      if (kw.length < 2) return h.fail(400, 'VALIDATION_ERROR', 'Invalid input', { fieldErrors: { keyword: ['Keyword is too short'] } });
      if (ruleRows().some((r) => r.keyword === kw)) return h.fail(409, 'RULE_EXISTS', 'This keyword already maps to a category');
      (GLOBAL_RULES[body.categoryId] ??= []).push(kw);
      return h.json({ id: ruleId(body.categoryId, kw), keyword: kw, categoryId: body.categoryId, weight: 1 }, 201);
    }),
    h.route('delete', '/admin/category-rules/:id', admin, ({ params }: any) => {
      const [categoryId, keyword] = decodeURIComponent(params.id).split('|');
      const list = GLOBAL_RULES[categoryId];
      const i = list ? list.indexOf(keyword) : -1;
      if (i < 0) return h.notFound();
      list.splice(i, 1);
      return noContent();
    }),
    // request: plan limits are data (plans.limits JSONB)
    h.route('get', '/admin/plans', admin, () => h.json([
      { code: 'FREE', name: 'Free', limits: { ...FREE_LIMITS }, users: db.users.filter((u) => u.plan === 'FREE').length },
      { code: 'PREMIUM', name: 'Premium', limits: { ...PREMIUM_LIMITS }, users: db.users.filter((u) => u.plan === 'PREMIUM').length },
    ])),
    h.route('patch', '/admin/plans/:code', { ...admin, schema: z.object({ limits: LimitsSchema }).strict() }, ({ params, body }: any) => {
      const target = params.code === 'FREE' ? FREE_LIMITS : params.code === 'PREMIUM' ? PREMIUM_LIMITS : null;
      if (!target) return h.notFound();
      Object.assign(target, body.limits); // limitsOf() hands out these objects, so every mock user sees the new limits at once
      return h.json({ code: params.code, name: params.code === 'FREE' ? 'Free' : 'Premium', limits: { ...target }, users: db.users.filter((u) => u.plan === params.code).length });
    }),
  ];
}

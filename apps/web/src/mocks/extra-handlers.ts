import { z } from 'zod';
import { db, iso } from './db';
import { boundsFor, budgetsOfPeriod, limitsOf, userTxns } from './logic';
import { moreHandlers } from './more-handlers';

/**
 * Endpoints the UI needs that the real API does not have YET (see docs/backend-requests.md). They exist only in MSW.
 * Adding one here is a promise to write it down in that file.
 */
interface Helpers {
  route: (...args: any[]) => any;
  json: (data: unknown, status?: number, meta?: unknown) => Response;
  fail: (status: number, code: string, message: string, details?: unknown) => Response;
  notFound: () => Response;
  planInfoUsage: (u: any) => { wallets: number; budgets: number; goals: number };
  goalView: (g: any) => unknown;
}

export function extraHandlers(h: Helpers) {
  return [
    ...moreHandlers(h),
    // #1 plan, limits and usage (upgrade dialog + plan badge)
    h.route('get', '/subscriptions/me', ({ user }: any) =>
      h.json({ plan: user.plan, limits: limitsOf(user), usage: h.planInfoUsage(user), currentPeriodEnd: user.plan === 'PREMIUM' ? iso(Date.now() + 30 * 86_400_000) : null })),
    // #2 contribution history of a goal
    h.route('get', '/goals/:id/contributions', ({ user, params }: any) => {
      const g = db.goals.find((x) => x.id === params.id && x.userId === user.id && !x.deletedAt);
      return g ? h.json(db.contributions.filter((c) => c.goalId === g.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))) : h.notFound();
    }),
    // #3 unread count for the bell badge
    h.route('get', '/notifications/unread-count', ({ user }: any) => h.json({ unread: db.notifications.filter((n) => n.userId === user.id && !n.readAt).length })),
    // BR-34 saving streak: days (Vietnam time) whose EXPENSE total is <= total budget / days of the period; 404 on the real API today
    h.route('get', '/reports/streak', ({ user }: any) => {
      const b = boundsFor(user.id);
      const total = budgetsOfPeriod(user.id, b.periodStart).find((x) => x.categoryId === null);
      if (!total) return h.json({ current: 0, best: 0, lastDay: null });
      const dayKey = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(d));
      const days = Math.max(1, Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 86_400_000));
      const limit = Math.floor(total.limitAmount / days);
      const spent = new Map<string, number>();
      for (const t of userTxns(user.id)) if (t.type === 'EXPENSE') spent.set(dayKey(t.occurredAt), (spent.get(dayKey(t.occurredAt)) ?? 0) + t.amount);
      const first = [...spent.keys()].sort()[0];
      let current = 0, best = 0, lastDay: string | null = null;
      for (let i = 59; i >= 0 && first; i--) {
        const k = dayKey(new Date(Date.now() - i * 86_400_000));
        if (k < first) continue;
        const ok = (spent.get(k) ?? 0) <= limit;
        current = ok ? current + 1 : 0; if (ok) lastDay = k; best = Math.max(best, current);
      }
      return h.json({ current, best, lastDay });
    }),
    // #7 resend the verification email (an expired 24 h link otherwise strands the user)
    h.route('post', '/auth/resend-verification', { public: true, schema: z.object({ email: z.string().trim().toLowerCase().email() }).strict() }, ({ body }: any) => {
      const email = body.email as string;
      const u = db.users.find((x) => x.email === email);
      if (u && u.verifiedAt === null) db.outbox.push({ to: u.email, kind: 'verify', token: `mock-verify-${u.id}`, at: iso(Date.now()) });
      return new Response(null, { status: 204 });
    }),
  ];
}

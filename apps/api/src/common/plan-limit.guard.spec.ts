import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanLimitGuard, PlanLimit, PremiumOnly } from './plan-limit.guard';

const FREE = { code: 'FREE', limits: { max_wallets: 3, max_budgets: 5, max_goals: 2, history_months: 6 } };
const PREMIUM = { code: 'PREMIUM', limits: { max_wallets: null, max_budgets: null, max_goals: null, history_months: null } };

function run(meta: { limit?: string; premium?: string }, plan: any, used = 0) {
  class C { handler() {} }
  if (meta.limit) PlanLimit(meta.limit as any)(C.prototype, 'handler', Object.getOwnPropertyDescriptor(C.prototype, 'handler')!);
  if (meta.premium) PremiumOnly(meta.premium)(C.prototype, 'handler', Object.getOwnPropertyDescriptor(C.prototype, 'handler')!);
  const plans: any = { forUser: jest.fn(async () => plan) };
  const usage: any = { count: jest.fn(async () => used) };
  const guard = new PlanLimitGuard(new Reflector(), plans, usage);
  const ctx = { getHandler: () => C.prototype.handler, switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }) } as unknown as ExecutionContext;
  return { go: () => guard.canActivate(ctx), plans, usage };
}

describe('SUB-01 PlanLimitGuard reads plans.limits', () => {
  it('is a no-op on handlers without metadata (no DB lookups)', async () => {
    const t = run({}, FREE);
    await expect(t.go()).resolves.toBe(true);
    expect(t.plans.forUser).not.toHaveBeenCalled();
  });
  it('allows creation below the limit', async () => {
    await expect(run({ limit: 'max_wallets' }, FREE, 2).go()).resolves.toBe(true);
  });
  it('blocks at the limit with 403 PLAN_LIMIT_REACHED and reports the limit', async () => {
    const t = run({ limit: 'max_wallets' }, FREE, 3);
    const err: any = await t.go().catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getStatus()).toBe(403);
    expect(err.getResponse()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { key: 'max_wallets', limit: 3 } });
    expect(t.usage.count).toHaveBeenCalledWith('u1', 'max_wallets', undefined);
  });
  it('uses each key\'s own limit (budgets 5, goals 2)', async () => {
    await expect(run({ limit: 'max_budgets' }, FREE, 4).go()).resolves.toBe(true);
    await expect(run({ limit: 'max_budgets' }, FREE, 5).go()).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ limit: 'max_goals' }, FREE, 2).go()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('null limits (Premium) are unlimited', async () => {
    await expect(run({ limit: 'max_wallets' }, PREMIUM, 10_000).go()).resolves.toBe(true);
  });
  it('@PremiumOnly blocks Free with PLAN_LIMIT_REACHED and lets Premium through', async () => {
    const err: any = await run({ premium: 'csv_import' }, FREE).go().catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { feature: 'csv_import' } });
    await expect(run({ premium: 'csv_import' }, PREMIUM).go()).resolves.toBe(true);
  });
  it('limits really come from the plan data: a custom plan with max_wallets=1 blocks the 2nd wallet', async () => {
    const custom = { code: 'FREE', limits: { ...FREE.limits, max_wallets: 1 } };
    await expect(run({ limit: 'max_wallets' }, custom, 1).go()).rejects.toBeInstanceOf(ForbiddenException);
  });
});

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { assertWithinLimit } from './plan-limit';
import { LimitKey, PlanUsageService } from './plan-usage.service';
import { PlansService } from './plans.service';

export const PLAN_LIMIT_KEY = 'plan_limit';
export const PREMIUM_ONLY_KEY = 'premium_only';
/** @PlanLimit('max_wallets'): one more must stay within plans.limits.max_wallets, else 403 PLAN_LIMIT_REACHED. */
export const PlanLimit = (key: LimitKey) => SetMetadata(PLAN_LIMIT_KEY, key);
/** @PremiumOnly('csv_import'): feature is PREMIUM only, else 403 PLAN_LIMIT_REACHED. */
export const PremiumOnly = (feature: string) => SetMetadata(PREMIUM_ONLY_KEY, feature);

/** SUB-01. Use after JwtAuthGuard. Limits are data (plans.limits JSONB), never constants in code. */
@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(private reflector: Reflector, private plans: PlansService, private usage: PlanUsageService) {}

  async canActivate(ctx: ExecutionContext) {
    const key = this.reflector.get<LimitKey | undefined>(PLAN_LIMIT_KEY, ctx.getHandler());
    const feature = this.reflector.get<string | undefined>(PREMIUM_ONLY_KEY, ctx.getHandler());
    if (!key && !feature) return true;
    const req = ctx.switchToHttp().getRequest();
    const userId: string = req.user.id;
    const period = typeof req.body?.period === 'string' && /^\d{4}-\d{2}$/.test(req.body.period) ? req.body.period : undefined;
    const plan = await this.plans.forUser(userId);
    if (feature && plan.code !== 'PREMIUM') {
      throw new ForbiddenException({ code: 'PLAN_LIMIT_REACHED', message: `${feature} requires the Premium plan`, details: { feature } });
    }
    if (key) assertWithinLimit(plan.limits[key], await this.usage.count(userId, key, period), key);
    return true;
  }
}

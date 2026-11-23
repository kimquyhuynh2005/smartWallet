import { Injectable } from '@nestjs/common';
import type { PlanLimits } from '@smartwallet/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async freePlan() {
    const p = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!p) throw new Error('Plans are not seeded. Run `npm run seed -w @smartwallet/api`.');
    return p;
  }

  /** Effective plan: newest ACTIVE, unexpired subscription, else FREE. Limits come from plans.limits (null = unlimited). */
  async forUser(userId: string): Promise<{ code: 'FREE' | 'PREMIUM'; limits: PlanLimits }> {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', deletedAt: null, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const plan = sub?.plan ?? (await this.freePlan());
    return { code: plan.code, limits: plan.limits as unknown as PlanLimits };
  }
}

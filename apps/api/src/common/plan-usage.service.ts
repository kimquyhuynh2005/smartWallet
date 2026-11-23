import { Injectable } from '@nestjs/common';
import { currentBudgetPeriod, periodFromMonth } from '@smartwallet/shared';
import { PrismaService } from '../prisma/prisma.service';

export type LimitKey = 'max_wallets' | 'max_budgets' | 'max_goals';

/** How much of each limited resource a user is currently using. */
@Injectable()
export class PlanUsageService {
  constructor(private prisma: PrismaService) {}

  /** `period` (YYYY-MM) only matters for max_budgets: the limit applies per budget period. */
  async count(userId: string, key: LimitKey, period?: string): Promise<number> {
    switch (key) {
      case 'max_wallets':
        return this.prisma.wallet.count({ where: { userId, deletedAt: null, isArchived: false } });
      case 'max_goals':
        return this.prisma.goal.count({ where: { userId, deletedAt: null, status: 'ACTIVE' } });
      case 'max_budgets': {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { monthStartDay: true } });
        const periodStart = period ? periodFromMonth(period, u.monthStartDay) : currentBudgetPeriod(new Date(), u.monthStartDay).periodStart;
        return this.prisma.budget.count({ where: { userId, period: periodStart, deletedAt: null } });
      }
    }
  }
}

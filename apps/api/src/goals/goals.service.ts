import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Goal } from '@prisma/client';
import { DomainEvents } from '../common/domain-events.service';
import { GOAL_CONTRIBUTION_CHANGED, GoalContributionChangedEvent } from '../common/events';
import type { AuthUser } from '../common/jwt-auth.guard';
import { assertWithinLimit } from '../common/plan-limit';
import { PlanUsageService } from '../common/plan-usage.service';
import { PlansService } from '../common/plans.service';
import { ReportCache } from '../common/report-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';

const MONTH_MS = 30.4375 * 86_400_000;

/** GOAL-02: how much to put aside per month to hit the target by the deadline. null = no deadline. */
export function requiredMonthlySaving(remaining: bigint, deadline: Date | null, now: Date): bigint | null {
  if (remaining <= 0n) return 0n;
  if (!deadline) return null;
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return remaining; // overdue: everything is due now
  const months = BigInt(Math.max(1, Math.ceil(ms / MONTH_MS)));
  return (remaining + months - 1n) / months; // round up so the plan never falls short
}

export const statusFor = (saved: bigint, target: bigint) => (saved >= target ? ('ACHIEVED' as const) : ('ACTIVE' as const));

@Injectable()
export class GoalsService {
  constructor(
    private prisma: PrismaService,
    private wallets: WalletsService,
    private plans: PlansService,
    private usage: PlanUsageService,
    private events: DomainEvents,
    private cache: ReportCache,
  ) {}

  present(g: Goal, now = new Date()) {
    const remaining = g.targetAmount - g.savedAmount;
    return {
      id: g.id, name: g.name, targetAmount: g.targetAmount, savedAmount: g.savedAmount, remainingAmount: remaining > 0n ? remaining : 0n,
      percent: g.targetAmount > 0n ? Number((g.savedAmount * 10000n) / g.targetAmount) / 100 : 0, deadline: g.deadline, walletId: g.walletId, status: g.status,
      requiredMonthlySaving: g.status === 'CANCELED' ? null : requiredMonthlySaving(remaining, g.deadline, now), createdAt: g.createdAt, updatedAt: g.updatedAt,
    };
  }

  async list(user: AuthUser) {
    return (await this.prisma.goal.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: 'desc' } })).map((g) => this.present(g));
  }

  private async find(userId: string, id: string, db: PrismaService | any = this.prisma): Promise<Goal> {
    const g = await db.goal.findFirst({ where: { id, userId, deletedAt: null } });
    if (!g) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Goal not found' });
    return g;
  }

  /** GOAL-01 (Free: max 2 active goals, enforced by PlanLimitGuard) */
  async create(user: AuthUser, dto: { name: string; targetAmount: number; deadline?: string; walletId?: string }) {
    if (dto.walletId) await this.wallets.getOwned(user, dto.walletId);
    const g = await this.prisma.goal.create({
      data: { userId: user.id, name: dto.name, targetAmount: BigInt(dto.targetAmount), deadline: dto.deadline ? new Date(dto.deadline) : null, walletId: dto.walletId ?? null },
    });
    await this.cache.bump(user.id);
    return this.present(g);
  }

  async update(user: AuthUser, id: string, dto: { name?: string; targetAmount?: number; deadline?: string | null; walletId?: string | null; status?: 'ACTIVE' | 'CANCELED' }) {
    const g = await this.find(user.id, id);
    if (dto.walletId) await this.wallets.getOwned(user, dto.walletId);
    const target = dto.targetAmount !== undefined ? BigInt(dto.targetAmount) : g.targetAmount;
    let status = g.status;
    if (dto.status === 'CANCELED') status = 'CANCELED';
    else if (dto.status === 'ACTIVE' || (g.status !== 'CANCELED' && dto.targetAmount !== undefined)) status = statusFor(g.savedAmount, target); // ACHIEVED is derived, never set by hand
    if (g.status === 'CANCELED' && status === 'ACTIVE') {
      const { limits } = await this.plans.forUser(user.id);
      assertWithinLimit(limits.max_goals, await this.usage.count(user.id, 'max_goals'), 'max_goals'); // re-activating takes a goal slot
    }
    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.targetAmount !== undefined ? { targetAmount: target } : {}),
        ...(dto.deadline !== undefined ? { deadline: dto.deadline ? new Date(dto.deadline) : null } : {}),
        ...(dto.walletId !== undefined ? { walletId: dto.walletId } : {}),
        status,
      },
    });
    await this.cache.bump(user.id);
    return this.present(updated);
  }

  async remove(user: AuthUser, id: string) {
    await this.find(user.id, id);
    await this.prisma.$transaction([
      this.prisma.goalContribution.updateMany({ where: { goalId: id, deletedAt: null }, data: { deletedAt: new Date() } }),
      this.prisma.goal.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    await this.cache.bump(user.id);
  }

  /**
   * GOAL-02: contribution row + saved_amount change + status flip in ONE database transaction.
   * The balance guard is part of the UPDATE's WHERE clause, so two concurrent withdrawals cannot overdraw the goal.
   */
  async contribute(user: AuthUser, id: string, dto: { amount: number; occurredAt?: string; note?: string }) {
    const amount = BigInt(dto.amount);
    const { contribution, goal } = await this.prisma.$transaction(async (tx) => {
      const g = await this.find(user.id, id, tx);
      if (g.status === 'CANCELED') throw new ConflictException({ code: 'GOAL_NOT_ACTIVE', message: 'Canceled goals cannot receive contributions' });
      const moved = await tx.goal.updateMany({
        where: { id, userId: user.id, deletedAt: null, ...(amount < 0n ? { savedAmount: { gte: -amount } } : {}) },
        data: { savedAmount: { increment: amount } },
      });
      if (moved.count === 0) throw new UnprocessableEntityException({ code: 'INSUFFICIENT_GOAL_BALANCE', message: 'Cannot withdraw more than has been saved' });
      const fresh = await tx.goal.findUniqueOrThrow({ where: { id } });
      const status = statusFor(fresh.savedAmount, fresh.targetAmount);
      const goal = status !== fresh.status ? await tx.goal.update({ where: { id }, data: { status } }) : fresh;
      const contribution = await tx.goalContribution.create({ data: { goalId: id, amount, occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(), note: dto.note } });
      return { contribution, goal };
    });
    await this.cache.bump(user.id);
    await this.events.publish<GoalContributionChangedEvent>(GOAL_CONTRIBUTION_CHANGED, { userId: user.id, goalId: id, amount: dto.amount, savedAmount: Number(goal.savedAmount), status: goal.status });
    return {
      contribution: { id: contribution.id, goalId: contribution.goalId, amount: contribution.amount, occurredAt: contribution.occurredAt, note: contribution.note, createdAt: contribution.createdAt },
      goal: this.present(goal),
    };
  }
}

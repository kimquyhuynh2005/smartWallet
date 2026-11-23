import { Injectable, Logger } from '@nestjs/common';
import { requiredMonthlySaving } from '../goals/goals.service';
import { scheduleStatus } from '../goals/schedule';
import { NotificationsService, parseSettings } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { isoWeekKey } from './week';

const PAGE = 500;

/**
 * Daily job (08:00 Vietnam time):
 *  1. goals with saved >= target become ACHIEVED (safety net: contributions already flip it, but a lowered target or a data fix may not)
 *  2. goals more than 20% behind schedule get a reminder, at most once per week per goal (dedupe goal:{id}:behind:{week})
 */
@Injectable()
export class GoalCheckService {
  private log = new Logger('GoalCheck');
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async run(now = new Date()): Promise<{ achieved: number; reminded: number }> {
    return { achieved: await this.markAchieved(), reminded: await this.remindBehind(now) };
  }

  private async markAchieved(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ id: string; user_id: string; name: string }[]>`
      SELECT id, user_id, name FROM goals WHERE status = 'ACTIVE' AND deleted_at IS NULL AND saved_amount >= target_amount`;
    if (!rows.length) return 0;
    await this.prisma.goal.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: 'ACTIVE' }, data: { status: 'ACHIEVED' } });
    for (const g of rows) {
      try {
        await this.notifications.notify(g.user_id, {
          type: 'GOAL', dedupeKey: `goal:${g.id}:achieved`, payload: { goalId: g.id, name: g.name, event: 'achieved' },
          message: { en: `Goal achieved: ${g.name}!`, vi: `Đã hoàn thành mục tiêu: ${g.name}!` },
        });
      } catch (e) { this.log.error(`achieved notice failed for goal ${g.id}: ${(e as Error).message}`); }
    }
    return rows.length;
  }

  private async remindBehind(now: Date): Promise<number> {
    const week = isoWeekKey(now);
    let reminded = 0;
    let cursor: string | undefined;
    for (;;) {
      const goals = await this.prisma.goal.findMany({
        where: { status: 'ACTIVE', deletedAt: null, deadline: { not: null } },
        include: { user: { select: { notificationSettings: true, deletedAt: true, status: true } } },
        orderBy: { id: 'asc' }, take: PAGE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (!goals.length) break;
      cursor = goals[goals.length - 1].id;
      for (const g of goals) {
        if (g.user.deletedAt || g.user.status !== 'ACTIVE' || !parseSettings(g.user.notificationSettings).goalReminders) continue;
        const s = scheduleStatus(g, now);
        if (!s.behind) continue;
        try {
          const need = requiredMonthlySaving(g.targetAmount - g.savedAmount, g.deadline, now);
          const pct = Number((g.savedAmount * 100n) / g.targetAmount);
          const expectedPct = Math.round(s.elapsed * 100);
          const r = await this.notifications.notify(g.userId, {
            type: 'GOAL', dedupeKey: `goal:${g.id}:behind:${week}`,
            payload: { goalId: g.id, name: g.name, event: 'behind', percent: pct, expectedPercent: expectedPct, requiredMonthlySaving: need === null ? null : Number(need) },
            message: {
              en: `"${g.name}" is behind schedule: ${pct}% saved, should be ${expectedPct}%.`,
              vi: `Mục tiêu "${g.name}" đang chậm tiến độ: đã tiết kiệm ${pct}%, theo kế hoạch cần ${expectedPct}%.`,
            },
          });
          if (r) reminded++;
        } catch (e) { this.log.error(`reminder failed for goal ${g.id}: ${(e as Error).message}`); }
      }
      if (goals.length < PAGE) break;
    }
    return reminded;
  }
}

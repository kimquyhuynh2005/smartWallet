import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { RecurringRule } from '@prisma/client';
import { CategoriesService } from '../categories/categories.service';
import { DomainEvents } from '../common/domain-events.service';
import { TRANSACTION_CHANGED, TransactionChangedEvent, snapshot } from '../common/events';
import type { AuthUser } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { nextRunAfter } from './schedule';

export const MAX_CATCH_UP = 366; // occurrences generated per rule per run (a long outage catches up over several runs)
const BATCH = 200;

@Injectable()
export class RecurringService {
  private log = new Logger('Recurring');

  constructor(private prisma: PrismaService, private wallets: WalletsService, private categories: CategoriesService, private events: DomainEvents) {}

  present(r: RecurringRule) {
    return {
      id: r.id, walletId: r.walletId, categoryId: r.categoryId, type: r.type, amount: r.amount, note: r.note, frequency: r.frequency,
      interval: r.interval, nextRunAt: r.nextRunAt, endAt: r.endAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  }

  async list(user: AuthUser) {
    return (await this.prisma.recurringRule.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { nextRunAt: 'asc' } })).map((r) => this.present(r));
  }

  private async find(user: AuthUser, id: string) {
    const r = await this.prisma.recurringRule.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Recurring rule not found' });
    return r;
  }

  async create(user: AuthUser, dto: { walletId: string; categoryId?: string | null; type: 'INCOME' | 'EXPENSE'; amount: number; note?: string | null; frequency: any; interval: number; nextRunAt: string; endAt?: string | null }) {
    await this.wallets.getUsable(user, dto.walletId);
    if (dto.categoryId) await this.categories.assertUsable(user.id, dto.categoryId, dto.type);
    const r = await this.prisma.recurringRule.create({
      data: {
        userId: user.id, walletId: dto.walletId, categoryId: dto.categoryId ?? null, type: dto.type, amount: BigInt(dto.amount), note: dto.note ?? null,
        frequency: dto.frequency, interval: dto.interval, nextRunAt: new Date(dto.nextRunAt), endAt: dto.endAt ? new Date(dto.endAt) : null,
      },
    });
    return this.present(r);
  }

  async update(user: AuthUser, id: string, dto: { walletId?: string; categoryId?: string | null; type?: 'INCOME' | 'EXPENSE'; amount?: number; note?: string | null; frequency?: any; interval?: number; nextRunAt?: string; endAt?: string | null }) {
    const cur = await this.find(user, id);
    if (dto.walletId && dto.walletId !== cur.walletId) await this.wallets.getUsable(user, dto.walletId);
    const type = dto.type ?? cur.type;
    const categoryId = dto.categoryId !== undefined ? dto.categoryId : cur.categoryId;
    if (categoryId && (dto.categoryId !== undefined || dto.type)) await this.categories.assertUsable(user.id, categoryId, type);
    const nextRunAt = dto.nextRunAt ? new Date(dto.nextRunAt) : cur.nextRunAt;
    const endAt = dto.endAt !== undefined ? (dto.endAt ? new Date(dto.endAt) : null) : cur.endAt;
    if (endAt && endAt <= nextRunAt) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'endAt must be after nextRunAt' });
    const r = await this.prisma.recurringRule.update({
      where: { id },
      data: {
        ...(dto.walletId ? { walletId: dto.walletId } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.amount !== undefined ? { amount: BigInt(dto.amount) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.frequency ? { frequency: dto.frequency } : {}),
        ...(dto.interval !== undefined ? { interval: dto.interval } : {}),
        nextRunAt, endAt,
      },
    });
    return this.present(r);
  }

  /** Stops future runs. Transactions already generated are real history and are kept. */
  async remove(user: AuthUser, id: string) {
    await this.find(user, id);
    await this.prisma.recurringRule.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * The BullMQ job body. Finds due rules and generates their transactions.
   * Safe to run concurrently / twice: each rule is locked (FOR UPDATE SKIP LOCKED) and its next_run_at is advanced
   * in the same DB transaction that inserts the rows, so an occurrence can never be generated twice.
   */
  async generateDue(now = new Date()): Promise<{ rules: number; transactions: number }> {
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM recurring_rules
      WHERE deleted_at IS NULL AND next_run_at <= ${now} AND (end_at IS NULL OR next_run_at <= end_at)
      ORDER BY next_run_at LIMIT ${BATCH}`;
    let transactions = 0;
    for (const { id } of due) {
      try {
        transactions += await this.runRule(id, now);
      } catch (e) {
        this.log.error(`rule ${id} failed: ${(e as Error).message}`); // one bad rule must not block the others
      }
    }
    return { rules: due.length, transactions };
  }

  private async runRule(id: string, now: Date): Promise<number> {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM recurring_rules
        WHERE id = ${id}::uuid AND deleted_at IS NULL AND next_run_at <= ${now} AND (end_at IS NULL OR next_run_at <= end_at)
        FOR UPDATE SKIP LOCKED`;
      if (!locked.length) return null; // another worker has it, or it is no longer due
      const rule = await tx.recurringRule.findUniqueOrThrow({ where: { id } });
      const wallet = await tx.wallet.findFirst({ where: { id: rule.walletId, deletedAt: null } });
      if (!wallet || wallet.isArchived) return null; // nothing to post into; rule stays due until the wallet is usable again
      const category = rule.categoryId ? await tx.category.findFirst({ where: { id: rule.categoryId, deletedAt: null } }) : null;

      const created = [];
      let next = rule.nextRunAt;
      while (next <= now && (!rule.endAt || next <= rule.endAt) && created.length < MAX_CATCH_UP) {
        created.push(
          await tx.transaction.create({
            data: { userId: rule.userId, walletId: rule.walletId, categoryId: category?.id ?? null, type: rule.type, amount: rule.amount, note: rule.note, occurredAt: next, source: 'RECURRING', recurringRuleId: rule.id },
          }),
        );
        next = nextRunAfter(next, rule.frequency, rule.interval);
      }
      await tx.recurringRule.update({ where: { id }, data: { nextRunAt: next } });
      return { rule, created };
    });
    if (!result || !result.created.length) return 0;
    await this.wallets.invalidate(result.rule.walletId);
    await this.events.publish<TransactionChangedEvent>(TRANSACTION_CHANGED, { userId: result.rule.userId, action: 'generated', current: result.created.map(snapshot), previous: [] });
    return result.created.length;
  }
}

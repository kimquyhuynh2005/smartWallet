import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Wallet } from '@prisma/client';
import { TRANSACTION_CHANGED, TransactionChangedEvent, snapshot } from '../common/events';
import { DomainEvents } from '../common/domain-events.service';
import type { AuthUser } from '../common/jwt-auth.guard';
import { assertWithinLimit } from '../common/plan-limit';
import { PlanUsageService } from '../common/plan-usage.service';
import { PlansService } from '../common/plans.service';
import { RedisService } from '../common/redis.service';
import { ReportCache } from '../common/report-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsRepository } from './wallets.repository';

@Injectable()
export class WalletsService {
  constructor(
    private repo: WalletsRepository,
    private prisma: PrismaService,
    private redis: RedisService,
    private plans: PlansService,
    private usage: PlanUsageService,
    private events: DomainEvents,
    private reportCache: ReportCache,
  ) {}

  /** WAL-02: balance = opening_balance + sum(transactions). Never stored; cached in Redis, invalidated on every write. */
  async balance(walletId: string, opening: bigint): Promise<bigint> {
    const key = `wallet:balance:${walletId}`;
    try {
      const hit = await this.redis.client.get(key);
      if (hit !== null) return BigInt(hit);
    } catch { /* cache is best-effort */ }
    const bal = opening + (await this.repo.txnSum(walletId));
    try { await this.redis.client.set(key, bal.toString(), 'EX', 300); } catch { /* ignore */ }
    return bal;
  }

  async invalidate(...walletIds: string[]) {
    const ids = [...new Set(walletIds)];
    if (!ids.length) return;
    try { await this.redis.client.del(...ids.map((id) => `wallet:balance:${id}`)); } catch { /* ignore */ }
  }

  async present(w: Wallet) {
    return {
      id: w.id, name: w.name, type: w.type, openingBalance: w.openingBalance, currency: w.currency, color: w.color,
      isArchived: w.isArchived, balance: await this.balance(w.id, w.openingBalance), createdAt: w.createdAt, updatedAt: w.updatedAt,
    };
  }

  /** WAL-02: archived wallets are hidden unless includeArchived is set (entry forms never pass it). */
  async list(user: AuthUser, includeArchived = false) {
    return Promise.all((await this.repo.list(user.id, includeArchived)).map((w) => this.present(w)));
  }

  /** 404 (not 403) for other users' wallets. */
  async getOwned(user: AuthUser, id: string, db?: PrismaService | any) {
    const w = await this.repo.find(user.id, id, db);
    if (!w) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Wallet not found' });
    return w;
  }

  /** For forms that record money: must be owned AND not archived. */
  async getUsable(user: AuthUser, id: string, db?: any) {
    const w = await this.getOwned(user, id, db);
    if (w.isArchived) throw new ConflictException({ code: 'WALLET_ARCHIVED', message: 'Archived wallets cannot receive new transactions' });
    return w;
  }

  async get(user: AuthUser, id: string) {
    return this.present(await this.getOwned(user, id));
  }

  async create(user: AuthUser, dto: any) {
    const w = await this.repo.create(user.id, dto); // plan limit enforced by PlanLimitGuard
    await this.reportCache.bump(user.id);
    return this.present(w);
  }

  async update(user: AuthUser, id: string, dto: { name?: string; type?: any; color?: string | null; isArchived?: boolean; openingBalance?: number }) {
    const w = await this.getOwned(user, id);
    if (dto.isArchived === false && w.isArchived) {
      const { limits } = await this.plans.forUser(user.id);
      assertWithinLimit(limits.max_wallets, await this.usage.count(user.id, 'max_wallets'), 'max_wallets'); // un-archiving takes a wallet slot
    }
    const { openingBalance, ...rest } = dto;
    const updated = await this.repo.update(id, { ...rest, ...(openingBalance !== undefined ? { openingBalance: BigInt(openingBalance) } : {}) });
    await this.invalidate(id);
    await this.reportCache.bump(user.id);
    return this.present(updated);
  }

  /**
   * Soft-deletes the wallet together with its transactions (including transfers touching it), atomically.
   * Counterpart wallets of removed transfers get their cached balance invalidated.
   */
  async remove(user: AuthUser, id: string) {
    await this.getOwned(user, id);
    const { removed } = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.transaction.findMany({ where: { userId: user.id, deletedAt: null, OR: [{ walletId: id }, { transferWalletId: id }] } });
      const now = new Date();
      await tx.transaction.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deletedAt: now } });
      await tx.recurringRule.updateMany({ where: { walletId: id, deletedAt: null }, data: { deletedAt: now } });
      await tx.goal.updateMany({ where: { walletId: id }, data: { walletId: null } });
      await tx.wallet.update({ where: { id }, data: { deletedAt: now } });
      return { removed: rows };
    });
    await this.reportCache.bump(user.id);
    await this.invalidate(id, ...removed.flatMap((r) => [r.walletId, ...(r.transferWalletId ? [r.transferWalletId] : [])]));
    if (removed.length) {
      await this.events.publish<TransactionChangedEvent>(TRANSACTION_CHANGED, { userId: user.id, action: 'wallet_deleted', current: [], previous: removed.map(snapshot) });
    }
  }
}

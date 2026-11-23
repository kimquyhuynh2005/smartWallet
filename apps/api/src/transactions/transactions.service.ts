import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MAX_RECEIPT_BYTES } from '@smartwallet/shared';
import { CategorizationService } from '../categories/categorization.service';
import { CategoriesService } from '../categories/categories.service';
import { DomainEvents } from '../common/domain-events.service';
import { TRANSACTION_CHANGED, TransactionChangedEvent, snapshot } from '../common/events';
import type { AuthUser } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WalletsService } from '../wallets/wallets.service';
import { TransactionsRepository } from './transactions.repository';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const RECEIPT_TTL = 300;
const SORTS: Record<string, Prisma.TransactionOrderByWithRelationInput[]> = {
  'occurredAt:desc': [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  'occurredAt:asc': [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  'amount:desc': [{ amount: 'desc' }, { occurredAt: 'desc' }],
  'amount:asc': [{ amount: 'asc' }, { occurredAt: 'desc' }],
};

export interface ListQuery {
  page: number; limit: number; sort: string; from?: string; to?: string; type?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  walletId?: string; categoryId?: string; minAmount?: number; maxAmount?: number; q?: string;
}

/** Date-only bounds are Vietnam calendar days; `to` is inclusive. */
export function dateBounds(from?: string, to?: string): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  if (from) out.gte = new Date(/^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00+07:00` : from);
  if (to) out.lte = new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999+07:00` : to);
  if (out.gte && out.lte && out.gte > out.lte) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: '`from` must not be after `to`' });
  return out;
}

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private repo: TransactionsRepository,
    private wallets: WalletsService,
    private categories: CategoriesService,
    private categorizer: CategorizationService,
    private storage: StorageService,
    private events: DomainEvents,
  ) {}

  async present(t: Transaction) {
    return {
      id: t.id, walletId: t.walletId, transferWalletId: t.transferWalletId, categoryId: t.categoryId, type: t.type, amount: t.amount,
      occurredAt: t.occurredAt, note: t.note, receiptUrl: t.receiptUrl ? await this.storage.getDownloadUrl(t.receiptUrl, RECEIPT_TTL) : null,
      recurringRuleId: t.recurringRuleId, source: t.source, createdAt: t.createdAt, updatedAt: t.updatedAt,
    };
  }

  /** After COMMIT: drop cached balances of every touched wallet, then publish transaction.changed. */
  private async afterCommit(userId: string, action: TransactionChangedEvent['action'], current: Transaction[], previous: Transaction[]): Promise<any[]> {
    const all = [...current, ...previous];
    await this.wallets.invalidate(...all.flatMap((t) => [t.walletId, ...(t.transferWalletId ? [t.transferWalletId] : [])]));
    return this.events.publish<TransactionChangedEvent>(TRANSACTION_CHANGED, { userId, action, current: current.map(snapshot), previous: previous.map(snapshot) });
  }

  /** Receipt keys must live under the caller's own prefix, so one user can never attach another user's object. */
  private checkReceiptKey(userId: string, key: string | null | undefined) {
    if (key && (!key.startsWith(`receipts/${userId}/`) || key.includes('..'))) {
      throw new UnprocessableEntityException({ code: 'INVALID_RECEIPT_KEY', message: 'Receipt key was not issued to this user' });
    }
  }

  /** TXN-01 */
  async create(user: AuthUser, dto: { walletId: string; categoryId?: string; type: 'INCOME' | 'EXPENSE'; amount: number; note?: string; occurredAt: string; receiptKey?: string }) {
    this.checkReceiptKey(user.id, dto.receiptKey);
    // what we would have suggested, computed BEFORE the row exists so it cannot learn from itself (CAT-04)
    const suggested = dto.note && dto.categoryId ? ((await this.categorizer.top(user.id, dto.note, dto.amount, dto.type))?.categoryId ?? null) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      await this.wallets.getUsable(user, dto.walletId, tx);
      if (dto.categoryId) await this.categories.assertUsable(user.id, dto.categoryId, dto.type);
      return this.repo.create(
        { userId: user.id, walletId: dto.walletId, categoryId: dto.categoryId, type: dto.type, amount: BigInt(dto.amount), note: dto.note, occurredAt: new Date(dto.occurredAt), receiptUrl: dto.receiptKey, source: 'MANUAL' },
        tx,
      );
    });
    const results = await this.afterCommit(user.id, 'created', [row], []);
    if (dto.note && dto.categoryId) await this.categorizer.learn(user.id, { note: dto.note, categoryId: dto.categoryId, suggestedCategoryId: suggested }); // CAT-04: only learns when the user overrode us
    // ALR-01: alerts this very expense triggered, so the UI can warn without a WebSocket
    return { ...(await this.present(row)), triggeredAlerts: results.flatMap((r) => r?.triggeredAlerts ?? []) };
  }

  /** TXN-02: one row, wallet_id -> transfer_wallet_id. It moves money between wallets and is never income or expense. */
  async transfer(user: AuthUser, dto: { fromWalletId: string; toWalletId: string; amount: number; note?: string; occurredAt: string }) {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.wallets.getUsable(user, dto.fromWalletId, tx);
      await this.wallets.getUsable(user, dto.toWalletId, tx);
      return this.repo.create(
        { userId: user.id, type: 'TRANSFER', walletId: dto.fromWalletId, transferWalletId: dto.toWalletId, amount: BigInt(dto.amount), note: dto.note, occurredAt: new Date(dto.occurredAt), source: 'MANUAL' },
        tx,
      );
    });
    await this.afterCommit(user.id, 'created', [row], []);
    return this.present(row);
  }

  async get(user: AuthUser, id: string) {
    const t = await this.repo.findOwned(user.id, id);
    if (!t) throw this.notFound();
    return this.present(t);
  }

  /** TXN-03 */
  async list(user: AuthUser, q: ListQuery) {
    const range = dateBounds(q.from, q.to);
    const where: Prisma.TransactionWhereInput = {
      userId: user.id,
      deletedAt: null,
      ...(q.type ? { type: q.type } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(range.gte || range.lte ? { occurredAt: range } : {}),
      ...(q.minAmount !== undefined || q.maxAmount !== undefined
        ? { amount: { ...(q.minAmount !== undefined ? { gte: BigInt(q.minAmount) } : {}), ...(q.maxAmount !== undefined ? { lte: BigInt(q.maxAmount) } : {}) } }
        : {}),
      ...(q.q ? { note: { contains: q.q, mode: 'insensitive' as const } } : {}),
      ...(q.walletId ? { OR: [{ walletId: q.walletId }, { transferWalletId: q.walletId }] } : {}),
    };
    const [rows, total] = await this.repo.page(where, SORTS[q.sort] ?? SORTS['occurredAt:desc'], (q.page - 1) * q.limit, q.limit);
    return { items: await Promise.all(rows.map((r) => this.present(r))), meta: { page: q.page, limit: q.limit, total } };
  }

  /** TXN-04: edit with recalculation (balances derive from rows; caches of old + new wallet are dropped). */
  async update(user: AuthUser, id: string, dto: { walletId?: string; categoryId?: string | null; type?: 'INCOME' | 'EXPENSE'; amount?: number; note?: string | null; occurredAt?: string; receiptKey?: string | null }) {
    this.checkReceiptKey(user.id, dto.receiptKey);
    const { prev, next } = await this.prisma.$transaction(async (tx) => {
      const prev = await this.repo.findOwned(user.id, id, tx);
      if (!prev) throw this.notFound();
      if (prev.type === 'TRANSFER' && (dto.walletId || dto.categoryId !== undefined || dto.type || dto.receiptKey !== undefined)) {
        throw new UnprocessableEntityException({ code: 'TRANSFER_FIELDS_IMMUTABLE', message: 'A transfer only allows amount, note and occurredAt to change' });
      }
      if (dto.walletId && dto.walletId !== prev.walletId) await this.wallets.getUsable(user, dto.walletId, tx);
      const type = dto.type ?? prev.type;
      const categoryId = dto.categoryId !== undefined ? dto.categoryId : prev.categoryId;
      if (type !== 'TRANSFER' && categoryId && (dto.categoryId !== undefined || dto.type)) await this.categories.assertUsable(user.id, categoryId, type);
      const data: Prisma.TransactionUncheckedUpdateInput = {
        ...(dto.walletId ? { walletId: dto.walletId } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.amount !== undefined ? { amount: BigInt(dto.amount) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.occurredAt ? { occurredAt: new Date(dto.occurredAt) } : {}),
        ...(dto.receiptKey !== undefined ? { receiptUrl: dto.receiptKey } : {}),
      };
      return { prev, next: await this.repo.update(id, data, tx) };
    });
    await this.afterCommit(user.id, 'updated', [next], [prev]);
    if (dto.categoryId && dto.categoryId !== prev.categoryId && next.note) await this.categorizer.learn(user.id, { note: next.note, categoryId: dto.categoryId, suggestedCategoryId: prev.categoryId }); // a correction is an override
    return this.present(next);
  }

  /** TXN-04 */
  async remove(user: AuthUser, id: string) {
    const prev = await this.prisma.$transaction(async (tx) => {
      const t = await this.repo.findOwned(user.id, id, tx);
      if (!t) throw this.notFound();
      await this.repo.softDelete(id, tx);
      return t;
    });
    await this.afterCommit(user.id, 'deleted', [], [prev]);
  }

  /** TXN-01: private S3 bucket, size-capped pre-signed POST. The client uploads straight to S3, then sends `receiptKey` with the transaction. */
  async createReceiptUpload(user: AuthUser, dto: { contentType: string; size: number }) {
    const key = `receipts/${user.id}/${randomUUID()}.${EXT[dto.contentType]}`;
    const ticket = await this.storage.createUploadTicket(key, dto.contentType, MAX_RECEIPT_BYTES, RECEIPT_TTL);
    return { key, url: ticket.url, fields: ticket.fields, maxBytes: MAX_RECEIPT_BYTES, expiresIn: RECEIPT_TTL };
  }

  private notFound() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
  }
}

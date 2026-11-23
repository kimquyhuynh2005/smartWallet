import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from '../wallets/wallets.repository';

@Injectable()
export class TransactionsRepository {
  constructor(private prisma: PrismaService) {}

  /** Every lookup is scoped by user_id (from the JWT) AND excludes soft-deleted rows. */
  findOwned(userId: string, id: string, db: Db = this.prisma) {
    return db.transaction.findFirst({ where: { id, userId, deletedAt: null } });
  }
  create(data: Prisma.TransactionUncheckedCreateInput, db: Db = this.prisma) {
    return db.transaction.create({ data });
  }
  update(id: string, data: Prisma.TransactionUncheckedUpdateInput, db: Db = this.prisma) {
    return db.transaction.update({ where: { id }, data });
  }
  softDelete(id: string, db: Db = this.prisma) {
    return db.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  page(where: Prisma.TransactionWhereInput, orderBy: Prisma.TransactionOrderByWithRelationInput[], skip: number, take: number) {
    return this.prisma.$transaction([this.prisma.transaction.findMany({ where, orderBy, skip, take }), this.prisma.transaction.count({ where })]);
  }
  /** Income/expense rows of one wallet inside a time window (duplicate detection for CSV import). */
  inWindow(userId: string, walletId: string, from: Date, to: Date) {
    return this.prisma.transaction.findMany({
      where: { userId, walletId, deletedAt: null, type: { in: ['INCOME', 'EXPENSE'] }, occurredAt: { gte: from, lt: to } },
      select: { type: true, amount: true, occurredAt: true, note: true },
    });
  }
}

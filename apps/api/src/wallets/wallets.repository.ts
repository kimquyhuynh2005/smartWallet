import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class WalletsRepository {
  constructor(private prisma: PrismaService) {}

  list(userId: string, includeArchived: boolean) {
    return this.prisma.wallet.findMany({
      where: { userId, deletedAt: null, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: { createdAt: 'asc' },
    });
  }
  find(userId: string, id: string, db: Db = this.prisma) {
    return db.wallet.findFirst({ where: { id, userId, deletedAt: null } });
  }
  create(userId: string, d: { name: string; type: any; openingBalance: number; currency: string; color?: string }) {
    return this.prisma.wallet.create({ data: { ...d, userId, openingBalance: BigInt(d.openingBalance) } });
  }
  update(id: string, data: Prisma.WalletUpdateInput, db: Db = this.prisma) {
    return db.wallet.update({ where: { id }, data });
  }

  /**
   * Net of all transactions for one wallet:
   *   + INCOME(wallet) - EXPENSE(wallet) - TRANSFER(out: wallet_id) + TRANSFER(in: transfer_wallet_id)
   */
  async txnSum(walletId: string): Promise<bigint> {
    const [own, incoming] = await Promise.all([
      this.prisma.transaction.groupBy({ by: ['type'], where: { walletId, deletedAt: null }, _sum: { amount: true } }),
      this.prisma.transaction.aggregate({ where: { transferWalletId: walletId, type: 'TRANSFER', deletedAt: null }, _sum: { amount: true } }),
    ]);
    const sum = (t: string) => own.find((r) => r.type === t)?._sum.amount ?? 0n;
    return sum('INCOME') - sum('EXPENSE') - sum('TRANSFER') + (incoming._sum.amount ?? 0n);
  }
}

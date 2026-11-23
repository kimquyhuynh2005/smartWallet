/** Unit-test helpers (excluded from the production build). */

/** A Prisma stand-in: every model method is a jest.fn; $transaction runs callbacks against the same mock (or resolves an array). */
export function mockPrisma(models: string[]) {
  const p: any = {
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg))),
    $queryRaw: jest.fn(),
  };
  for (const m of models) {
    p[m] = Object.fromEntries(
      ['findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'findMany', 'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'count', 'aggregate', 'groupBy', 'deleteMany'].map((f) => [f, jest.fn()]),
    );
  }
  return p;
}

/** Ordered log shared between mocks so tests can assert "X happened after commit". */
export function callLog() {
  const log: string[] = [];
  return { log, note: (s: string) => log.push(s) };
}

export class FakeRedis {
  store = new Map<string, string>();
  ttl = new Map<string, number>();
  client: any = this;
  failing = false;
  private guard() { if (this.failing) throw new Error('redis down'); }
  async get(k: string) { this.guard(); return this.store.get(k) ?? null; }
  async getdel(k: string) { this.guard(); const v = this.store.get(k) ?? null; this.store.delete(k); return v; }
  async set(k: string, v: string, _ex?: string, s?: number) { this.guard(); this.store.set(k, v); if (s) this.ttl.set(k, s); }
  async del(...ks: string[]) { this.guard(); ks.forEach((k) => this.store.delete(k)); }
  async incr(k: string) { this.guard(); const n = Number(this.store.get(k) ?? 0) + 1; this.store.set(k, String(n)); return n; }
}

export const user = { id: 'u1', role: 'USER' as const };
export const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const txnRow = (over: Record<string, unknown> = {}) => ({
  id: UID(100), userId: 'u1', walletId: UID(1), transferWalletId: null, categoryId: null, type: 'EXPENSE', amount: 50_000n,
  occurredAt: new Date('2026-11-10T05:00:00Z'), note: null, receiptUrl: null, recurringRuleId: null, source: 'MANUAL',
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
});

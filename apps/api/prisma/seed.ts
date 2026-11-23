/* Idempotent seed. `tsx prisma/seed.ts [--reference-only]`
 * reference data: plans, default categories, global category rules
 * dev data: admin + demo user (skipped with --reference-only; admin password REQUIRED in production, demo skipped) */
import { PrismaClient, CategoryType, WalletType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { currentBudgetPeriod, normalizeText } from '@smartwallet/shared';

const prisma = new PrismaClient();
const isProd = process.env.NODE_ENV === 'production';

const PLANS = [
  { code: 'FREE' as const, name: 'Free', priceVnd: 0n, limits: { max_wallets: 3, max_budgets: 5, max_goals: 2, history_months: 6 } },
  { code: 'PREMIUM' as const, name: 'Premium', priceVnd: 49_000n, limits: { max_wallets: null, max_budgets: null, max_goals: null, history_months: null } },
];

type Cat = { nameEn: string; nameVi: string; type: CategoryType; icon: string; color: string };
const CATEGORIES: Cat[] = [
  { nameEn: 'Food & Drinks', nameVi: 'Ăn uống', type: 'EXPENSE', icon: 'utensils', color: '#F97316' },
  { nameEn: 'Transport', nameVi: 'Di chuyển', type: 'EXPENSE', icon: 'car', color: '#3B82F6' },
  { nameEn: 'Housing', nameVi: 'Nhà ở', type: 'EXPENSE', icon: 'home', color: '#8B5CF6' },
  { nameEn: 'Bills', nameVi: 'Hóa đơn', type: 'EXPENSE', icon: 'receipt', color: '#EAB308' },
  { nameEn: 'Shopping', nameVi: 'Mua sắm', type: 'EXPENSE', icon: 'shopping-bag', color: '#EC4899' },
  { nameEn: 'Entertainment', nameVi: 'Giải trí', type: 'EXPENSE', icon: 'clapperboard', color: '#14B8A6' },
  { nameEn: 'Education', nameVi: 'Học tập', type: 'EXPENSE', icon: 'graduation-cap', color: '#6366F1' },
  { nameEn: 'Health', nameVi: 'Sức khỏe', type: 'EXPENSE', icon: 'heart-pulse', color: '#EF4444' },
  { nameEn: 'Gifts', nameVi: 'Quà tặng', type: 'EXPENSE', icon: 'gift', color: '#F43F5E' },
  { nameEn: 'Other', nameVi: 'Khác', type: 'EXPENSE', icon: 'ellipsis', color: '#64748B' },
  { nameEn: 'Salary', nameVi: 'Lương', type: 'INCOME', icon: 'banknote', color: '#16A34A' },
  { nameEn: 'Allowance', nameVi: 'Tiền được cho', type: 'INCOME', icon: 'hand-coins', color: '#22C55E' },
  { nameEn: 'Part-time', nameVi: 'Làm thêm', type: 'INCOME', icon: 'briefcase', color: '#10B981' },
  { nameEn: 'Bonus', nameVi: 'Thưởng', type: 'INCOME', icon: 'trophy', color: '#84CC16' },
  { nameEn: 'Other', nameVi: 'Khác', type: 'INCOME', icon: 'ellipsis', color: '#64748B' },
];

// keyword (already diacritic-free) -> category nameEn (all expense categories)
const RULES: Record<string, string[]> = {
  Transport: ['grab', 'be', 'xang'],
  'Food & Drinks': ['highlands', 'phuc long', 'tra sua', 'ca phe'],
  Shopping: ['shopee', 'lazada', 'tiki'],
  Bills: ['dien', 'nuoc', 'internet'],
};

export async function seedReference() {
  for (const p of PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, update: { name: p.name, priceVnd: p.priceVnd, limits: p.limits }, create: p });
  }
  const catId = new Map<string, string>();
  for (const c of CATEGORIES) {
    const found = await prisma.category.findFirst({ where: { userId: null, nameEn: c.nameEn, type: c.type } });
    const row = found ?? (await prisma.category.create({ data: c }));
    catId.set(`${c.type}:${c.nameEn}`, row.id);
  }
  for (const [cat, kws] of Object.entries(RULES)) {
    for (const kw of kws) {
      const keyword = normalizeText(kw);
      const exists = await prisma.categoryRule.findFirst({ where: { userId: null, keyword } });
      if (!exists) await prisma.categoryRule.create({ data: { userId: null, keyword, categoryId: catId.get(`EXPENSE:${cat}`)!, weight: 1 } });
    }
  }
  return catId;
}

async function ensureUser(email: string, fullName: string, password: string, role: 'USER' | 'ADMIN') {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const free = await prisma.plan.findUniqueOrThrow({ where: { code: 'FREE' } });
  return prisma.user.create({
    data: {
      email, fullName, role, passwordHash: await bcrypt.hash(password, 12), emailVerifiedAt: new Date(),
      subscriptions: { create: { planId: free.id, status: 'ACTIVE', currentPeriodStart: new Date() } },
    },
  });
}

// deterministic PRNG so the demo data is reproducible
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round1k = (n: number) => Math.round(n / 1000) * 1000;

async function seedDemo(catId: Map<string, string>) {
  const demo = await ensureUser('demo@smartwallet.local', 'Nguyễn Minh Anh', process.env.SEED_DEMO_PASSWORD ?? 'Demo@12345', 'USER');
  if (await prisma.transaction.count({ where: { userId: demo.id } })) return; // already seeded

  const mk = (name: string, type: WalletType, openingBalance: bigint, color: string) =>
    prisma.wallet.create({ data: { userId: demo.id, name, type, openingBalance, color } });
  const [cash, bank, momo] = await Promise.all([
    mk('Tiền mặt', 'CASH', 500_000n, '#16A34A'),
    mk('Vietcombank', 'BANK', 5_000_000n, '#0EA5E9'),
    mk('MoMo', 'EWALLET', 300_000n, '#DB2777'),
  ]);

  const rand = rng(261);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const E = (n: string) => catId.get(`EXPENSE:${n}`)!;
  const I = (n: string) => catId.get(`INCOME:${n}`)!;
  const now = new Date();
  const rows: any[] = [];
  const add = (monthsAgo: number, day: number, type: 'INCOME' | 'EXPENSE' | 'TRANSFER', amount: number, w: { id: string }, category: string | null, note: string, to?: { id: string }) => {
    // 12:00 Vietnam time (= 05:00Z) on that day
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 5, int(0, 59)));
    if (d > now) return;
    rows.push({ userId: demo.id, walletId: w.id, categoryId: category, type, amount: BigInt(amount), occurredAt: d, note, transferWalletId: to?.id ?? null });
  };

  for (const m of [2, 1, 0]) {
    add(m, 5, 'INCOME', 12_000_000, bank, I('Salary'), 'Lương tháng');
    add(m, 15, 'INCOME', round1k(int(1_500_000, 2_800_000)), momo, I('Part-time'), 'Làm thêm cuối tuần');
    add(m, 2, 'EXPENSE', 3_000_000, bank, E('Housing'), 'Tiền nhà');
    add(m, 8, 'EXPENSE', round1k(int(380_000, 520_000)), bank, E('Bills'), 'Tiền điện');
    add(m, 8, 'EXPENSE', round1k(int(90_000, 140_000)), bank, E('Bills'), 'Tiền nước');
    add(m, 9, 'EXPENSE', 220_000, bank, E('Bills'), 'Internet FPT');
    add(m, 6, 'TRANSFER', 1_000_000, bank, null, 'Nạp MoMo', momo);
    add(m, 7, 'TRANSFER', 2_000_000, bank, null, 'Rút tiền mặt', cash);
    add(m, 12, 'EXPENSE', 260_000, momo, E('Entertainment'), 'Netflix');
    add(m, int(18, 25), 'EXPENSE', round1k(int(90_000, 180_000)), momo, E('Entertainment'), 'Xem phim CGV');
    add(m, 20, 'EXPENSE', 500_000, bank, E('Education'), 'Khóa học tiếng Anh');
    if (m !== 1) add(m, int(10, 27), 'EXPENSE', round1k(int(150_000, 400_000)), cash, E('Health'), 'Mua thuốc');
    if (m === 0) add(m, 3, 'EXPENSE', 300_000, cash, E('Gifts'), 'Quà sinh nhật bạn');
    for (let i = 0; i < 22; i++) {
      const [note, lo, hi, w] = pick<[string, number, number, { id: string }]>([
        ['Phở bò', 45_000, 65_000, cash], ['Cơm trưa', 35_000, 55_000, cash], ['Cà phê Highlands', 49_000, 69_000, momo],
        ['Trà sữa Phúc Long', 45_000, 75_000, momo], ['Bún chả', 40_000, 60_000, cash], ['Ăn tối với bạn', 120_000, 250_000, bank],
      ]);
      add(m, int(1, 28), 'EXPENSE', round1k(int(lo, hi)), w, E('Food & Drinks'), note);
    }
    for (let i = 0; i < 9; i++) {
      const [note, lo, hi, w] = pick<[string, number, number, { id: string }]>([
        ['Grab đi học', 28_000, 75_000, momo], ['Xăng xe máy', 60_000, 100_000, cash], ['Be về nhà', 30_000, 60_000, momo],
      ]);
      add(m, int(1, 28), 'EXPENSE', round1k(int(lo, hi)), w, E('Transport'), note);
    }
    for (let i = 0; i < 3; i++) add(m, int(1, 28), 'EXPENSE', round1k(int(150_000, 650_000)), momo, E('Shopping'), pick(['Shopee - áo thun', 'Lazada - tai nghe', 'Tiki - sách']));
  }
  await prisma.transaction.createMany({ data: rows });

  // current-period budgets + a savings goal
  const { periodStart } = currentBudgetPeriod(now, demo.monthStartDay);
  const budgets: [string | null, number][] = [[null, 12_000_000], [E('Food & Drinks'), 3_500_000], [E('Transport'), 1_000_000], [E('Shopping'), 1_500_000]];
  for (const [categoryId, limit] of budgets) {
    await prisma.budget.create({ data: { userId: demo.id, period: periodStart, categoryId, limitAmount: BigInt(limit) } });
  }
  const goal = await prisma.goal.create({
    data: { userId: demo.id, name: 'Mua laptop', targetAmount: 20_000_000n, savedAmount: 6_500_000n, deadline: new Date(Date.UTC(now.getUTCFullYear() + 1, 5, 1)), walletId: bank.id },
  });
  await prisma.goalContribution.createMany({
    data: [3_000_000n, 2_000_000n, 1_500_000n].map((amount, i) => ({ goalId: goal.id, amount, occurredAt: new Date(now.getTime() - (i + 1) * 20 * 86_400_000), note: 'Tiết kiệm' })),
  });
}

async function main() {
  const catId = await seedReference();
  if (process.argv.includes('--reference-only')) return;

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? (isProd ? undefined : 'Admin@12345');
  if (!adminPassword) throw new Error('SEED_ADMIN_PASSWORD is required in production');
  await ensureUser(process.env.SEED_ADMIN_EMAIL ?? 'admin@smartwallet.local', 'SmartWallet Admin', adminPassword, 'ADMIN');
  if (!isProd) await seedDemo(catId);
}

main()
  .then(() => console.log('seed ok'))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

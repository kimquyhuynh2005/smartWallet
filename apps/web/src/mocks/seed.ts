import { currentBudgetPeriod } from '@smartwallet/shared';
import { CAT, db, iso, sysId, uuid, type TxnRec, type UserRec, type WalletRec } from './db';
import { spentInPeriod } from './logic';

/** deterministic PRNG so every reload shows the same two people */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r1k = (n: number) => Math.round(n / 1000) * 1000;
const DAY = 86_400_000;

import { DEMO } from './demo';
export { DEMO };

const settings = { inApp: true, email: true, weeklySummary: true, goalReminders: true };

export function seed() {
  db.users.length = db.wallets.length = db.categories.length = db.txns.length = db.budgets.length = db.goals.length = db.contributions.length = db.notifications.length = db.recurring.length = 0;
  db.imports.clear();
  const now = new Date();
  const created = iso(now.getTime() - 200 * DAY);

  const user = (u: Partial<UserRec> & Pick<UserRec, 'id' | 'email' | 'fullName'>): UserRec => {
    const rec: UserRec = { password: 'Demo@12345', avatarUrl: null, role: 'USER', status: 'ACTIVE', locale: 'vi', currency: 'VND', monthStartDay: 1, plan: 'FREE', onboarded: true, createdAt: created, settings: { ...settings }, ...u };
    db.users.push(rec);
    return rec;
  };
  const wallet = (userId: string, name: string, type: WalletRec['type'], openingBalance: number, color: string): WalletRec => {
    const w: WalletRec = { id: uuid(), userId, name, type, openingBalance, currency: 'VND', color, isArchived: false, createdAt: created, updatedAt: created, deletedAt: null };
    db.wallets.push(w);
    return w;
  };

  // ---------------- Linh, 21, student, Free plan ----------------
  const linh = user({ id: DEMO.linh.id, email: DEMO.linh.email, fullName: 'Trần Thị Mỹ Linh', plan: 'FREE' });
  const lCash = wallet(linh.id, 'Tiền mặt', 'CASH', 400_000, '#2C7A58');
  const lMomo = wallet(linh.id, 'MoMo', 'EWALLET', 150_000, '#B2506F');
  const lBank = wallet(linh.id, 'Vietcombank', 'BANK', 1_200_000, '#2F8A85');

  // ---------------- Minh, 27, office worker, Premium ----------------
  const minh = user({ id: DEMO.minh.id, email: DEMO.minh.email, fullName: 'Nguyễn Văn Minh', plan: 'PREMIUM' });
  const mBank = wallet(minh.id, 'Vietcombank', 'BANK', 18_000_000, '#2F8A85');
  const mCash = wallet(minh.id, 'Tiền mặt', 'CASH', 1_500_000, '#2C7A58');
  const mMomo = wallet(minh.id, 'MoMo', 'EWALLET', 600_000, '#B2506F');
  const mCard = wallet(minh.id, 'Thẻ tín dụng Techcombank', 'CREDIT', 0, '#A33A32');
  const mSave = wallet(minh.id, 'Tiết kiệm mua nhà', 'BANK', 95_000_000, '#4F6FA3');
  void mCard;

  user({ id: DEMO.admin.id, email: DEMO.admin.email, fullName: 'Quản trị SmartWallet', role: 'ADMIN', plan: 'PREMIUM', onboarded: true });

  const add = (userId: string, walletId: string, type: TxnRec['type'], amount: number, at: Date, note: string | null, categoryId: string | null, transferWalletId: string | null = null) => {
    if (at.getTime() > now.getTime()) return;
    const ts = iso(at);
    db.txns.push({ id: uuid(), userId, walletId, transferWalletId, categoryId, type, amount, occurredAt: ts, note, receiptKey: null, recurringRuleId: null, source: 'MANUAL', createdAt: ts, updatedAt: ts, deletedAt: null });
  };
  const nowVn = new Date(now.getTime() + 7 * 3_600_000);

  for (let m = 5; m >= 0; m--) {
    // 12:00 Vietnam time on day `d` of the calendar month `m` months ago
    const at = (d: number, hour = 12, minute = 0) => new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth() - m, d, hour - 7, minute));
    const monthNo = ((nowVn.getUTCMonth() - m) % 12 + 12) % 12 + 1;
    const prevMonthNo = monthNo === 1 ? 12 : monthNo - 1;
    const rl = rng(7000 + m), rm = rng(9000 + m);
    const pickL = <T,>(a: T[]) => a[Math.floor(rl() * a.length)];
    const pickM = <T,>(a: T[]) => a[Math.floor(rm() * a.length)];

    // ===== Linh =====
    add(linh.id, lBank.id, 'INCOME', 4_500_000, at(2, 9), `Gia đình gửi tiền sinh hoạt tháng ${monthNo}`, CAT['Allowance']);
    add(linh.id, lMomo.id, 'INCOME', r1k(1_800_000 + rl() * 700_000), at(15, 20), 'Lương làm thêm quán cà phê', CAT['Part-time']);
    add(linh.id, lBank.id, 'EXPENSE', 1_800_000, at(3, 10), `tiền nhà tháng ${monthNo}`, CAT['Housing']);
    add(linh.id, lBank.id, 'TRANSFER', 1_000_000, at(4, 9), 'Nạp MoMo', null, lMomo.id);
    add(linh.id, lBank.id, 'TRANSFER', 600_000, at(5, 9), 'Rút tiền mặt', null, lCash.id);
    add(linh.id, lMomo.id, 'EXPENSE', 120_000, at(9, 21), 'Data 4G Viettel', CAT['Bills']);
    add(linh.id, lMomo.id, 'EXPENSE', 70_000, at(12, 8), 'Netflix chia nhóm', CAT['Entertainment']);
    add(linh.id, lBank.id, 'EXPENSE', 185_000, at(8, 18), 'Tiền điện nước', CAT['Bills']);
    for (let i = 0; i < 21; i++) {
      const [note, lo, hi, w] = pickL<[string, number, number, WalletRec]>([
        ['Cơm trưa căn tin', 30_000, 45_000, lCash], ['Cà phê Highlands', 49_000, 69_000, lMomo], ['Trà sữa Phúc Long', 45_000, 65_000, lMomo],
        ['Bún bò Huế', 40_000, 55_000, lCash], ['Cà phê học nhóm', 25_000, 39_000, lCash], ['Ăn tối với bạn', 90_000, 180_000, lMomo],
      ]);
      add(linh.id, w.id, 'EXPENSE', r1k(lo + rl() * (hi - lo)), at(1 + Math.floor(rl() * 27), 11 + Math.floor(rl() * 9), Math.floor(rl() * 60)), note, CAT['Food & Drinks']);
    }
    for (let i = 0; i < 12; i++) {
      const [note, lo, hi, w] = pickL<[string, number, number, WalletRec]>([['Grab đi học', 28_000, 62_000, lMomo], ['Grab đi làm', 35_000, 75_000, lMomo], ['Xăng xe máy', 55_000, 85_000, lCash]]);
      add(linh.id, w.id, 'EXPENSE', r1k(lo + rl() * (hi - lo)), at(1 + Math.floor(rl() * 27), 7 + Math.floor(rl() * 12), Math.floor(rl() * 60)), note, CAT['Transport']);
    }
    for (let i = 0; i < 3; i++) add(linh.id, lMomo.id, 'EXPENSE', r1k(80_000 + rl() * 280_000), at(1 + Math.floor(rl() * 27), 20, 15), pickL(['Shopee - ốp lưng điện thoại', 'Shopee - áo thun', 'Lazada - tai nghe', 'Tiki - sách tiếng Anh']), CAT['Shopping']);
    add(linh.id, lCash.id, 'EXPENSE', 45_000, at(18, 14), 'Photo giáo trình', CAT['Education']);
    if (m % 2 === 0) add(linh.id, lMomo.id, 'EXPENSE', 95_000, at(20, 19), 'Xem phim CGV với nhóm', CAT['Entertainment']);

    // ===== Minh =====
    add(minh.id, mBank.id, 'INCOME', 28_000_000, at(5, 9), `lương tháng ${prevMonthNo}`, CAT['Salary']);
    if (m % 3 === 1) add(minh.id, mBank.id, 'INCOME', 6_500_000, at(20, 15), 'Thưởng quý', CAT['Bonus']);
    add(minh.id, mBank.id, 'EXPENSE', 7_500_000, at(3, 10), `tiền nhà tháng ${monthNo}`, CAT['Housing']);
    add(minh.id, mBank.id, 'EXPENSE', r1k(420_000 + rm() * 150_000), at(8, 9), 'Tiền điện', CAT['Bills']);
    add(minh.id, mBank.id, 'EXPENSE', 115_000, at(8, 9), 'Tiền nước', CAT['Bills']);
    add(minh.id, mBank.id, 'EXPENSE', 220_000, at(9, 9), 'Internet FPT', CAT['Bills']);
    add(minh.id, mBank.id, 'TRANSFER', 8_000_000, at(6, 9), 'Gửi tiết kiệm mua nhà', null, mSave.id);
    add(minh.id, mBank.id, 'TRANSFER', 2_000_000, at(7, 9), 'Rút tiền mặt', null, mCash.id);
    add(minh.id, mMomo.id, 'EXPENSE', 260_000, at(12, 8), 'Netflix + Spotify', CAT['Entertainment']);
    for (let i = 0; i < 26; i++) {
      const [note, lo, hi, w] = pickM<[string, number, number, WalletRec]>([
        ['Cơm trưa văn phòng', 45_000, 70_000, mMomo], ['Cà phê Highlands', 49_000, 69_000, mMomo], ['Phở bò sáng', 50_000, 70_000, mCash],
        ['Ăn tối với đồng nghiệp', 150_000, 320_000, mBank], ['Trà sữa Phúc Long', 55_000, 75_000, mMomo], ['Đi siêu thị cuối tuần', 280_000, 520_000, mBank],
      ]);
      add(minh.id, w.id, 'EXPENSE', r1k(lo + rm() * (hi - lo)), at(1 + Math.floor(rm() * 27), 11 + Math.floor(rm() * 9), Math.floor(rm() * 60)), note, CAT['Food & Drinks']);
    }
    for (let i = 0; i < 10; i++) {
      const [note, lo, hi, w] = pickM<[string, number, number, WalletRec]>([['Grab đi làm', 40_000, 95_000, mMomo], ['Đổ xăng', 70_000, 110_000, mCash]]);
      add(minh.id, w.id, 'EXPENSE', r1k(lo + rm() * (hi - lo)), at(1 + Math.floor(rm() * 27), 7 + Math.floor(rm() * 12), Math.floor(rm() * 60)), note, CAT['Transport']);
    }
    for (let i = 0; i < 4; i++) add(minh.id, mMomo.id, 'EXPENSE', r1k(150_000 + rm() * 700_000), at(1 + Math.floor(rm() * 27), 21, 30), pickM(['Shopee - giày chạy bộ', 'Lazada - bàn phím cơ', 'Tiki - sách kỹ năng', 'Shopee - đồ gia dụng']), CAT['Shopping']);
    add(minh.id, mBank.id, 'EXPENSE', 600_000, at(22, 18), 'Khóa học tiếng Anh', CAT['Education']);
    if (m % 2 === 1) add(minh.id, mCash.id, 'EXPENSE', 350_000, at(16, 10), 'Khám sức khỏe định kỳ', CAT['Health']);
    if (m % 2 === 0) add(minh.id, mBank.id, 'EXPENSE', 500_000, at(25, 17), 'Quà sinh nhật bạn', CAT['Gifts']);
    add(minh.id, mMomo.id, 'EXPENSE', r1k(180_000 + rm() * 200_000), at(14, 19), 'Xem phim + ăn tối', CAT['Entertainment']);
  }

  // ---------------- budgets for the current period (near / over their limit on purpose) ----------------
  const periodStart = currentBudgetPeriod(now, 1).periodStart;
  const budget = (userId: string, categoryId: string | null, limit: number, extra: Partial<{ rolloverMode: 'NONE' | 'CARRY_FORWARD'; thresholds: number[] }> = {}) =>
    db.budgets.push({ id: uuid(), userId, period: iso(periodStart), categoryId, limitAmount: limit, rolloverMode: extra.rolloverMode ?? 'NONE', rolloverAmount: 0, alertThresholds: extra.thresholds ?? [80, 100], createdAt: created, updatedAt: created, deletedAt: null });
  /** top the category up to a target percentage of its limit so the demo always shows calm / warning / over states */
  const topUp = (userId: string, walletId: string, categoryId: string, limit: number, pct: number, note: string) => {
    const have = spentInPeriod(userId, categoryId, now);
    const need = r1k(limit * pct - have);
    if (need > 0) add(userId, walletId, 'EXPENSE', need, new Date(now.getTime() - 3_600_000 * 5), note, categoryId);
  };

  budget(linh.id, null, 6_500_000);
  budget(linh.id, CAT['Food & Drinks'], 1_500_000);
  budget(linh.id, CAT['Transport'], 600_000);
  budget(linh.id, CAT['Shopping'], 500_000);
  budget(linh.id, CAT['Entertainment'], 300_000);
  topUp(linh.id, lMomo.id, CAT['Food & Drinks'], 1_500_000, 0.88, 'Ăn tối sinh nhật bạn');
  topUp(linh.id, lMomo.id, CAT['Transport'], 600_000, 1.12, 'Grab đi chơi Quận 1');
  topUp(linh.id, lMomo.id, CAT['Shopping'], 500_000, 0.62, 'Shopee - đồ dùng học tập');
  topUp(linh.id, lMomo.id, CAT['Entertainment'], 300_000, 0.35, 'Xem phim CGV');

  budget(minh.id, null, 20_000_000, { rolloverMode: 'CARRY_FORWARD' });
  budget(minh.id, CAT['Food & Drinks'], 5_000_000);
  budget(minh.id, CAT['Shopping'], 3_000_000);
  budget(minh.id, CAT['Entertainment'], 1_500_000, { thresholds: [50, 90, 100] });
  budget(minh.id, CAT['Transport'], 1_200_000);
  topUp(minh.id, mMomo.id, CAT['Shopping'], 3_000_000, 0.85, 'Shopee - ghế công thái học');
  topUp(minh.id, mMomo.id, CAT['Entertainment'], 1_500_000, 1.06, 'Vé concert cuối tuần');
  topUp(minh.id, mBank.id, CAT['Food & Drinks'], 5_000_000, 0.55, 'Đi siêu thị cuối tuần');
  topUp(minh.id, mMomo.id, CAT['Transport'], 1_200_000, 0.3, 'Grab đi làm');

  // ---------------- goals ----------------
  const goal = (userId: string, name: string, target: number, saved: number, deadlineDays: number, walletId: string | null, steps: number[]) => {
    const g = { id: uuid(), userId, name, targetAmount: target, savedAmount: saved, deadline: iso(now.getTime() + deadlineDays * DAY), walletId, status: 'ACTIVE' as const, createdAt: iso(now.getTime() - 150 * DAY), updatedAt: created, deletedAt: null };
    db.goals.push(g);
    steps.forEach((amount, i) => db.contributions.push({ id: uuid(), goalId: g.id, amount, occurredAt: iso(now.getTime() - (steps.length - i) * 22 * DAY), note: 'Tiết kiệm tháng này', createdAt: iso(now.getTime() - (steps.length - i) * 22 * DAY) }));
  };
  goal(linh.id, 'Chuyến đi Đà Lạt', 6_000_000, 2_200_000, 95, lBank.id, [800_000, 700_000, 700_000]);
  goal(linh.id, 'Quỹ khẩn cấp', 10_000_000, 1_500_000, 330, null, [500_000, 500_000, 500_000]);
  goal(minh.id, 'Đặt cọc mua nhà', 400_000_000, 135_000_000, 700, mSave.id, [40_000_000, 35_000_000, 30_000_000, 30_000_000]);
  goal(minh.id, 'Mua laptop mới', 35_000_000, 33_000_000, 45, mBank.id, [12_000_000, 12_000_000, 9_000_000]);

  // ---------------- recurring rules + a few notifications ----------------
  db.recurring.push({ id: uuid(), userId: linh.id, walletId: lMomo.id, categoryId: CAT['Entertainment'], type: 'EXPENSE', amount: 70_000, note: 'Netflix chia nhóm', frequency: 'MONTHLY', interval: 1, nextRunAt: iso(now.getTime() + 20 * DAY), endAt: null, createdAt: created, updatedAt: created, deletedAt: null });
  db.recurring.push({ id: uuid(), userId: minh.id, walletId: mBank.id, categoryId: CAT['Housing'], type: 'EXPENSE', amount: 7_500_000, note: 'Tiền nhà', frequency: 'MONTHLY', interval: 1, nextRunAt: iso(now.getTime() + 12 * DAY), endAt: null, createdAt: created, updatedAt: created, deletedAt: null });

  for (const b of db.budgets.filter((x) => x.userId === linh.id && x.categoryId)) {
    const spent = spentInPeriod(linh.id, b.categoryId, now);
    const pct = Math.floor((spent * 100) / b.limitAmount);
    const name = db.users.length && b.categoryId ? (Object.entries(CAT).find(([, id]) => id === b.categoryId)?.[0] ?? '') : '';
    const vi = b.categoryId === CAT['Food & Drinks'] ? 'Ăn uống' : b.categoryId === CAT['Transport'] ? 'Di chuyển' : b.categoryId === CAT['Shopping'] ? 'Mua sắm' : 'Giải trí';
    if (pct >= 80) {
      const t = pct >= 100 ? 100 : 80;
      db.notifications.push({
        id: uuid(), userId: linh.id, type: t >= 100 ? 'BUDGET_EXCEEDED' : 'BUDGET_WARNING', dedupeKey: `budget:${b.id}:${t}`, readAt: null, createdAt: iso(now.getTime() - 2 * 3_600_000),
        message: { en: `${pct}% of ${name} used`, vi: `Đã dùng ${pct}% ngân sách ${vi}` }, payload: { budgetId: b.id, categoryId: b.categoryId, threshold: t, percentUsed: pct },
      });
    }
  }
  void sysId;
  // ---------------- a crowd for the admin console (users table, growth chart). No wallets or transactions: admins never see those anyway ----------------
  const FIRST = ['Anh', 'Bảo', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Lan', 'Minh', 'Nam', 'Oanh', 'Phúc', 'Quân', 'Thảo', 'Uyên', 'Việt'];
  const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'];
  for (let i = 0; i < 38; i++) {
    const ageDays = Math.floor(((i * 37) % 330) + 3);
    const rec = user({ id: uuid(), email: `nguoidung${i + 1}@example.vn`, fullName: `${LAST[i % LAST.length]} ${FIRST[(i * 5) % FIRST.length]} ${FIRST[(i * 3 + 1) % FIRST.length]}`, plan: i % 5 === 0 ? 'PREMIUM' : 'FREE', status: i % 13 === 7 ? 'LOCKED' : 'ACTIVE', onboarded: false });
    rec.createdAt = iso(now.getTime() - ageDays * DAY);
    rec.password = uuid(); // nobody logs in as these
  }

}

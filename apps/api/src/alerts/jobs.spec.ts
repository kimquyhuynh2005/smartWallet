import { UID, mockPrisma } from '../testing/mocks';
import { scheduleStatus } from '../goals/schedule';
import { GoalCheckService } from './goal-check.service';
import { WeeklySummaryService, renderWeekly } from './weekly-summary.service';
import { isoWeekKey, vnd } from './week';

const D = (s: string) => new Date(s);

describe('week helpers', () => {
  it('isoWeekKey is the Vietnam-local Monday of the week', () => {
    expect(isoWeekKey(D('2026-11-21T05:00:00Z'))).toBe('2026-11-16'); // Saturday 21 Nov -> Monday 16 Nov
    expect(isoWeekKey(D('2026-11-16T00:00:00Z'))).toBe('2026-11-16');
    expect(isoWeekKey(D('2026-11-15T17:30:00Z'))).toBe('2026-11-16'); // 00:30 Monday in Vietnam is already Monday
    expect(isoWeekKey(D('2026-11-15T16:30:00Z'))).toBe('2026-11-09'); // still Sunday in Vietnam
  });
  it('vnd formats whole dong with Vietnamese separators', () => {
    expect(vnd(1_250_000)).toBe('1.250.000 ₫');
  });
});

describe('GOAL-02 scheduleStatus: "more than 20% behind schedule"', () => {
  const goal = (saved: number, over: Record<string, unknown> = {}) => ({ createdAt: D('2026-01-01T00:00:00Z'), deadline: D('2026-11-01T00:00:00Z'), targetAmount: 10_000_000n, savedAmount: BigInt(saved), ...over });

  it('expected progress is a straight line from creation to the deadline', () => {
    const s = scheduleStatus(goal(0), D('2026-06-01T12:00:00Z'));
    expect(s.elapsed).toBeCloseTo(0.5, 1);
    expect(Number(s.expectedAmount)).toBeGreaterThan(4_900_000);
    expect(Number(s.expectedAmount)).toBeLessThan(5_100_000);
  });
  it('behind = saved is more than 20% under the schedule (shortfall > 0.2)', () => {
    const half = D('2026-06-01T12:00:00Z'); // expected ~5,000,000
    expect(scheduleStatus(goal(3_000_000), half).behind).toBe(true); // 40% short
    expect(scheduleStatus(goal(3_900_000), half).behind).toBe(true); // 22% short
    expect(scheduleStatus(goal(4_100_000), half).behind).toBe(false); // 18% short
    expect(scheduleStatus(goal(5_000_000), half).behind).toBe(false);
    expect(scheduleStatus(goal(8_000_000), half).behind).toBe(false); // ahead of schedule
  });
  it('shortfallRatio is relative to what should have been saved by now', () => {
    expect(scheduleStatus(goal(2_500_000), D('2026-06-01T12:00:00Z')).shortfallRatio).toBeCloseTo(0.5, 1);
  });
  it('no reminders in the first 10% of the time, without a deadline, or once the target is reached', () => {
    expect(scheduleStatus(goal(0), D('2026-01-20T00:00:00Z')).behind).toBe(false); // ~6% elapsed
    expect(scheduleStatus(goal(0, { deadline: null }), D('2026-06-01T00:00:00Z')).behind).toBe(false);
    expect(scheduleStatus(goal(10_000_000), D('2026-10-30T00:00:00Z')).behind).toBe(false);
  });
  it('a goal past its deadline expects the full target', () => {
    const s = scheduleStatus(goal(6_000_000), D('2027-01-01T00:00:00Z'));
    expect(s.elapsed).toBe(1);
    expect(s.expectedAmount).toBe(10_000_000n);
    expect(s.behind).toBe(true);
  });
  it('a deadline before creation does not crash', () => {
    expect(scheduleStatus(goal(0, { deadline: D('2025-12-01T00:00:00Z') }), D('2026-06-01T00:00:00Z')).behind).toBe(true);
  });
});

describe('ALR-03 daily goal check', () => {
  function setup(goals: any[] = [], achieved: any[] = []) {
    const prisma = mockPrisma(['goal']);
    prisma.$queryRaw.mockResolvedValue(achieved);
    prisma.goal.findMany.mockResolvedValueOnce(goals);
    const notify = jest.fn(async () => ({ notification: {}, inApp: true, email: false }));
    return { svc: new GoalCheckService(prisma, { notify } as any), prisma, notify };
  }
  const g = (over: Record<string, unknown> = {}) => ({
    id: UID(1), userId: 'u1', name: 'Laptop', targetAmount: 10_000_000n, savedAmount: 2_000_000n, createdAt: D('2026-01-01T00:00:00Z'), deadline: D('2026-11-01T00:00:00Z'), status: 'ACTIVE',
    user: { notificationSettings: {}, deletedAt: null, status: 'ACTIVE' }, ...over,
  });
  const NOW = D('2026-06-01T12:00:00Z');

  it('marks goals with saved >= target ACHIEVED and congratulates once (dedupe goal:{id}:achieved)', async () => {
    const { svc, prisma, notify } = setup([], [{ id: UID(7), user_id: 'u9', name: 'Trip' }]);
    expect(await svc.run(NOW)).toEqual({ achieved: 1, reminded: 0 });
    expect(prisma.goal.updateMany).toHaveBeenCalledWith({ where: { id: { in: [UID(7)] }, status: 'ACTIVE' }, data: { status: 'ACHIEVED' } });
    expect(notify).toHaveBeenCalledWith('u9', expect.objectContaining({ type: 'GOAL', dedupeKey: `goal:${UID(7)}:achieved`, message: { en: 'Goal achieved: Trip!', vi: 'Đã hoàn thành mục tiêu: Trip!' } }));
  });
  it('reminds when more than 20% behind schedule, at most once per week (dedupe goal:{id}:behind:{monday})', async () => {
    const { svc, notify } = setup([g()]);
    expect((await svc.run(NOW)).reminded).toBe(1);
    const arg = (notify.mock.calls[0] as any[])[1];
    expect(arg.dedupeKey).toBe(`goal:${UID(1)}:behind:2026-06-01`);
    expect(arg.payload).toMatchObject({ goalId: UID(1), event: 'behind', percent: 20, expectedPercent: 50 });
    expect(arg.message.en).toContain('behind schedule');
    expect(arg.payload.requiredMonthlySaving).toBeGreaterThan(0);
  });
  it('does not remind goals that are on track, muted, or owned by deleted/locked users', async () => {
    const { svc, notify } = setup([
      g({ savedAmount: 5_000_000n }),
      g({ id: UID(2), user: { notificationSettings: { goalReminders: false }, deletedAt: null, status: 'ACTIVE' } }),
      g({ id: UID(3), user: { notificationSettings: {}, deletedAt: new Date(), status: 'ACTIVE' } }),
      g({ id: UID(4), user: { notificationSettings: {}, deletedAt: null, status: 'LOCKED' } }),
    ]);
    expect((await svc.run(NOW)).reminded).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
  it('a dedupe hit (null) is not counted as a reminder; one failing goal does not stop the others', async () => {
    const { svc, notify } = setup([g(), g({ id: UID(2) }), g({ id: UID(3) })]);
    notify.mockResolvedValueOnce(null as any).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ notification: {}, inApp: true, email: false });
    expect((await svc.run(NOW)).reminded).toBe(1);
    expect(notify).toHaveBeenCalledTimes(3);
  });
});

describe('ALR-03 weekly summary', () => {
  const data = { income: 5_000_000, expense: 1_200_000, transactions: 9, top: [{ nameEn: 'Food', nameVi: 'Ăn uống', total: 600_000 }, { nameEn: 'Transport', nameVi: 'Di chuyển', total: 300_000 }], budgetsOver: 1, budgetsNear: 2, goals: [{ name: 'Laptop', percent: 32 }] };

  it('renders the week in English and Vietnamese', () => {
    const m = renderWeekly(data);
    expect(m.en).toContain('spent 1.200.000 ₫');
    expect(m.en).toContain('earned 5.000.000 ₫');
    expect(m.en).toContain('net +3.800.000 ₫');
    expect(m.en).toContain('Top spending: Food 600.000 ₫, Transport 300.000 ₫');
    expect(m.en).toContain('Budgets: 1 over the limit, 2 close to it.');
    expect(m.en).toContain('Goals: Laptop 32%.');
    expect(m.vi).toContain('chi 1.200.000 ₫');
    expect(m.vi).toContain('Chi nhiều nhất: Ăn uống 600.000 ₫');
    expect(m.vi).toContain('Mục tiêu: Laptop 32%.');
  });
  it('omits sections with nothing to say and shows a negative net without a plus', () => {
    const m = renderWeekly({ ...data, income: 0, top: [], budgetsOver: 0, budgetsNear: 0, goals: [] });
    expect(m.en).not.toContain('Top spending');
    expect(m.en).not.toContain('Budgets:');
    expect(m.en).not.toContain('Goals:');
    expect(m.en).toContain('net -1.200.000 ₫');
  });

  function setup(users: any[], collect: (id: string) => any) {
    const prisma = mockPrisma(['user']);
    prisma.user.findMany.mockResolvedValueOnce(users);
    const notify = jest.fn(async () => ({ notification: {}, inApp: true, email: true }));
    const svc = new WeeklySummaryService(prisma, {} as any, { notify } as any);
    jest.spyOn(svc, 'collect').mockImplementation(async (id: string) => collect(id));
    return { svc, prisma, notify };
  }
  const NOW = D('2026-11-23T02:00:00Z'); // Monday 09:00 Vietnam

  it('sends one SYSTEM notification per user per week (dedupe weekly:{user}:{monday}) with an email subject', async () => {
    const { svc, notify, prisma } = setup([{ id: 'u1', notificationSettings: {} }], () => data);
    expect(await svc.run(NOW)).toEqual({ users: 1, sent: 1 });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, status: 'ACTIVE', emailVerifiedAt: { not: null } });
    expect(notify).toHaveBeenCalledWith('u1', expect.objectContaining({
      type: 'SYSTEM', dedupeKey: 'weekly:u1:2026-11-23', emailSubject: { en: 'Your SmartWallet week', vi: 'Tuần của bạn trên SmartWallet' },
      payload: expect.objectContaining({ kind: 'weekly_summary', week: '2026-11-23', income: 5_000_000 }),
    }));
  });
  it('skips users who turned the weekly summary off, and weeks without any transaction', async () => {
    const { svc, notify } = setup([{ id: 'u1', notificationSettings: { weeklySummary: false } }, { id: 'u2', notificationSettings: {} }], () => ({ ...data, transactions: 0 }));
    expect(await svc.run(NOW)).toEqual({ users: 1, sent: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
  it('running twice in a week is harmless (dedupe hit = not counted) and one broken user does not stop the run', async () => {
    const { svc, notify } = setup([{ id: 'u1', notificationSettings: {} }, { id: 'u2', notificationSettings: {} }, { id: 'u3', notificationSettings: {} }], () => data);
    notify.mockResolvedValueOnce(null as any).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ notification: {}, inApp: true, email: true });
    expect(await svc.run(NOW)).toEqual({ users: 3, sent: 1 });
  });
});

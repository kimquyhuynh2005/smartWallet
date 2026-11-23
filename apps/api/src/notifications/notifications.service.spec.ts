import { NotFoundException } from '@nestjs/common';
import { UID, mockPrisma, user } from '../testing/mocks';
import { NotificationsService, parseSettings } from './notifications.service';

const input = { type: 'BUDGET_WARNING' as const, dedupeKey: `budget:${UID(1)}:80`, payload: { budgetId: UID(1), threshold: 80 }, message: { en: '82% of Food used', vi: 'Đã dùng 82% ngân sách Ăn uống' } };
const row = (over: Record<string, unknown> = {}) => ({ id: UID(10), userId: 'u1', type: 'BUDGET_WARNING', payload: { ...input.payload, message: input.message }, readAt: null, dedupeKey: input.dedupeKey, createdAt: new Date('2026-11-21T05:00:00Z'), deletedAt: null, ...over });

function setup(userRow: Record<string, unknown> | null = { email: 'a@b.com', locale: 'vi', emailVerifiedAt: new Date(), notificationSettings: {} }) {
  const prisma = mockPrisma(['notification', 'user']);
  prisma.user.findFirst.mockResolvedValue(userRow);
  prisma.user.findUniqueOrThrow.mockResolvedValue({ locale: 'vi', notificationSettings: {} });
  prisma.notification.create.mockImplementation(async () => row());
  const realtime: any = { emit: jest.fn() };
  const emails: any = { enqueue: jest.fn() };
  return { svc: new NotificationsService(prisma, realtime, emails), prisma, realtime, emails };
}

describe('ALR-02 notify', () => {
  it('stores the notification, pushes it live as notification:new and queues ONE email (idempotent job key)', async () => {
    const { svc, prisma, realtime, emails } = setup();
    const r = await svc.notify('u1', input);
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', type: 'BUDGET_WARNING', dedupeKey: input.dedupeKey, payload: { threshold: 80, message: input.message } });
    expect(realtime.emit).toHaveBeenCalledWith('u1', 'notification:new', expect.objectContaining({ id: UID(10), type: 'BUDGET_WARNING', message: 'Đã dùng 82% ngân sách Ăn uống' }));
    expect(emails.enqueue).toHaveBeenCalledWith({ to: 'a@b.com', subject: 'SmartWallet: Đã dùng 82% ngân sách Ăn uống', text: expect.stringContaining('Đã dùng 82%') }, `email:${input.dedupeKey}`);
    expect(r).toMatchObject({ inApp: true, email: true });
  });
  it('the message follows the user\'s language; the stored payload is returned without the message map', async () => {
    const { svc } = setup({ email: 'a@b.com', locale: 'en', emailVerifiedAt: new Date(), notificationSettings: {} });
    const r = await svc.notify('u1', input);
    expect(r!.notification.message).toBe('82% of Food used');
    expect(r!.notification.payload).toEqual({ budgetId: UID(1), threshold: 80 });
  });
  it('the unique dedupe key means the same alert is never sent twice: P2002 -> null, nothing pushed or queued', async () => {
    const { svc, prisma, realtime, emails } = setup();
    prisma.notification.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    expect(await svc.notify('u1', input)).toBeNull();
    expect(realtime.emit).not.toHaveBeenCalled();
    expect(emails.enqueue).not.toHaveBeenCalled();
  });
  it('other database errors are not swallowed', async () => {
    const { svc, prisma } = setup();
    prisma.notification.create.mockRejectedValue(new Error('connection lost'));
    await expect(svc.notify('u1', input)).rejects.toThrow('connection lost');
  });
  it('muted channels: in-app muted = stored but no live push; email muted = no email job', async () => {
    const a = setup({ email: 'a@b.com', locale: 'vi', emailVerifiedAt: new Date(), notificationSettings: { inApp: false } });
    expect(await a.svc.notify('u1', input)).toMatchObject({ inApp: false, email: true });
    expect(a.realtime.emit).not.toHaveBeenCalled();
    expect(a.prisma.notification.create).toHaveBeenCalled();
    const b = setup({ email: 'a@b.com', locale: 'vi', emailVerifiedAt: new Date(), notificationSettings: { email: false } });
    expect(await b.svc.notify('u1', input)).toMatchObject({ inApp: true, email: false });
    expect(b.emails.enqueue).not.toHaveBeenCalled();
    expect(b.realtime.emit).toHaveBeenCalled();
  });
  it('no email to an unverified address', async () => {
    const { svc, emails } = setup({ email: 'a@b.com', locale: 'vi', emailVerifiedAt: null, notificationSettings: {} });
    expect((await svc.notify('u1', input))!.email).toBe(false);
    expect(emails.enqueue).not.toHaveBeenCalled();
  });
  it('a queue outage never loses the stored in-app notification', async () => {
    const { svc, emails } = setup();
    emails.enqueue.mockRejectedValue(new Error('redis down'));
    await expect(svc.notify('u1', input)).resolves.toMatchObject({ inApp: true });
  });
  it('deleted or locked users get nothing (no row, no push)', async () => {
    const { svc, prisma, realtime } = setup(null);
    expect(await svc.notify('u1', input)).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(realtime.emit).not.toHaveBeenCalled();
  });
});

describe('ALR-02 settings', () => {
  it('parseSettings fills defaults and ignores junk', () => {
    expect(parseSettings(undefined)).toEqual({ inApp: true, email: true, weeklySummary: true, goalReminders: true });
    expect(parseSettings({ email: false, inApp: 'no', extra: 1 })).toEqual({ inApp: true, email: false, weeklySummary: true, goalReminders: true });
  });
  it('updateSettings merges a partial patch into the current settings and saves it', async () => {
    const { svc, prisma } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ notificationSettings: { email: false } });
    const out = await svc.updateSettings(user, { weeklySummary: false });
    expect(out).toEqual({ inApp: true, email: false, weeklySummary: false, goalReminders: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { notificationSettings: out } });
  });
});

describe('ALR-02 list / read', () => {
  it('lists newest first with pagination and an unread filter, scoped to the JWT user', async () => {
    const { svc, prisma } = setup();
    prisma.notification.findMany.mockResolvedValue([row()]);
    prisma.notification.count.mockResolvedValue(41);
    const out = await svc.list(user, { page: 3, limit: 10, unread: true });
    expect(prisma.notification.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', deletedAt: null, readAt: null }, orderBy: { createdAt: 'desc' }, skip: 20, take: 10 });
    expect(out.meta).toEqual({ page: 3, limit: 10, total: 41 });
    expect(out.items[0]).not.toHaveProperty('userId');
  });
  it('markRead only touches unread rows of the caller (idempotent) and 404s for anything else', async () => {
    const { svc, prisma } = setup();
    prisma.notification.findFirst.mockResolvedValue(row({ readAt: new Date() }));
    await svc.markRead(user, UID(10));
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { id: UID(10), userId: 'u1', deletedAt: null, readAt: null }, data: { readAt: expect.any(Date) } });
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(svc.markRead(user, UID(10))).rejects.toBeInstanceOf(NotFoundException);
  });
  it('markAllRead reports how many changed', async () => {
    const { svc, prisma } = setup();
    prisma.notification.updateMany.mockResolvedValue({ count: 7 });
    expect(await svc.markAllRead(user)).toEqual({ updated: 7 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', deletedAt: null, readAt: null }, data: { readAt: expect.any(Date) } });
  });
});

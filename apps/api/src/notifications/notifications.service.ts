import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import { DEFAULT_NOTIFICATION_SETTINGS, NotificationSettings, WS_EVENTS } from '@smartwallet/shared';
import type { AuthUser } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime.gateway';
import { EmailQueueService } from './email-queue.service';

export interface Localized { en: string; vi: string }
export interface NotifyInput {
  type: NotificationType;
  /** UNIQUE in the database: the same key can only ever produce one notification (e.g. budget:{id}:{threshold}) */
  dedupeKey: string;
  payload: Record<string, unknown>;
  message: Localized;
  emailSubject?: Localized;
}
export type NotificationView = ReturnType<NotificationsService['present']>;
export interface NotifyResult { notification: NotificationView; inApp: boolean; email: boolean }

export function parseSettings(raw: unknown): NotificationSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (k: keyof NotificationSettings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : DEFAULT_NOTIFICATION_SETTINGS[k]);
  return { inApp: pick('inApp'), email: pick('email'), weeklySummary: pick('weeklySummary'), goalReminders: pick('goalReminders') };
}

/**
 * The one place a notification is created and delivered (ALR-02).
 * Stored first (the unique dedupe key is the guard against double alerts), then fanned out per channel unless muted:
 * in-app = Socket.IO push, email = BullMQ job.
 */
@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');

  constructor(private prisma: PrismaService, private realtime: RealtimePublisher, private emails: EmailQueueService) {}

  present(n: Notification, locale: string) {
    const { message, ...payload } = (n.payload ?? {}) as { message?: Localized } & Record<string, unknown>;
    return { id: n.id, type: n.type, message: (locale === 'en' ? message?.en : message?.vi) ?? message?.en ?? '', payload, readAt: n.readAt, createdAt: n.createdAt };
  }

  /** null = already sent (dedupe hit) or the user no longer exists / is locked. */
  async notify(userId: string, input: NotifyInput): Promise<NotifyResult | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      select: { email: true, locale: true, emailVerifiedAt: true, notificationSettings: true },
    });
    if (!user) return null;
    let row: Notification;
    try {
      row = await this.prisma.notification.create({
        data: { userId, type: input.type, dedupeKey: input.dedupeKey, payload: { ...input.payload, message: input.message } as any },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return null; // unique(dedupe_key): this alert was already sent
      throw e;
    }
    const settings = parseSettings(user.notificationSettings);
    const view = this.present(row, user.locale);
    if (settings.inApp) this.realtime.emit(userId, WS_EVENTS.notification, view);
    const email = settings.email && !!user.emailVerifiedAt;
    if (email) {
      const subject = input.emailSubject ?? { en: `SmartWallet: ${input.message.en}`, vi: `SmartWallet: ${input.message.vi}` };
      const loc = user.locale === 'en' ? 'en' : 'vi';
      const url = process.env.APP_URL ?? 'http://localhost:5173';
      try {
        await this.emails.enqueue({ to: user.email, subject: subject[loc], text: `${input.message[loc]}\n\n${url}\n` }, `email:${input.dedupeKey}`);
      } catch (e) {
        this.log.error(`could not queue email for ${input.dedupeKey}: ${(e as Error).message}`); // the in-app notification is already stored
      }
    }
    return { notification: view, inApp: settings.inApp, email };
  }

  async list(user: AuthUser, q: { page: number; limit: number; unread?: boolean }) {
    const where = { userId: user.id, deletedAt: null, ...(q.unread ? { readAt: null } : {}) };
    const [rows, total, u] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.notification.count({ where }),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { locale: true } }),
    ]);
    return { items: rows.map((r) => this.present(r, u.locale)), meta: { page: q.page, limit: q.limit, total } };
  }

  /** idempotent: reading twice keeps the first read time */
  async markRead(user: AuthUser, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, deletedAt: null, readAt: null }, data: { readAt: new Date() } });
    const row = await this.prisma.notification.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification not found' });
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { locale: true } });
    return this.present(row, u.locale);
  }

  async markAllRead(user: AuthUser) {
    const r = await this.prisma.notification.updateMany({ where: { userId: user.id, deletedAt: null, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  async getSettings(user: AuthUser) {
    return parseSettings((await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationSettings: true } })).notificationSettings);
  }

  async updateSettings(user: AuthUser, patch: Partial<NotificationSettings>) {
    const next = { ...(await this.getSettings(user)), ...patch };
    await this.prisma.user.update({ where: { id: user.id }, data: { notificationSettings: next } });
    return next;
  }
}

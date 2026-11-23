import { Controller, Get, HttpCode, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NotificationOut, NotificationQuerySchema, NotificationSettingsSchema, ReadAllOut, UpdateNotificationSettingsSchema } from '@smartwallet/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { Owned, OwnershipGuard } from '../common/ownership.guard';
import { ApiData, ApiErrors, ZBody, ZQuery } from '../common/swagger';
import { EmailQueueService } from './email-queue.service';
import { NotificationsService } from './notifications.service';
import { RealtimeGateway, RealtimePublisher } from '../realtime/realtime.gateway';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnershipGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'ALR-02: my notifications, newest first (?unread=true for the badge)' })
  @ApiData(NotificationOut, { list: true })
  @ApiErrors(400, 401)
  list(@CurrentUser() u: AuthUser, @ZQuery(NotificationQuerySchema) q: { page: number; limit: number; unread?: boolean }) {
    return this.svc.list(u, q);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark every unread notification as read' })
  @ApiData(ReadAllOut)
  @ApiErrors(401)
  readAll(@CurrentUser() u: AuthUser) {
    return this.svc.markAllRead(u);
  }

  @Patch(':id/read')
  @Owned('notification')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Mark one notification as read (idempotent)' })
  @ApiData(NotificationOut)
  @ApiErrors(401, 404)
  read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.markRead(u, id);
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notification-settings')
export class NotificationSettingsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'ALR-02: which channels are on (inApp, email, weeklySummary, goalReminders)' })
  @ApiData(NotificationSettingsSchema)
  @ApiErrors(401)
  get(@CurrentUser() u: AuthUser) {
    return this.svc.getSettings(u);
  }

  @Patch()
  @ApiOperation({ summary: 'ALR-02: mute or unmute channels' })
  @ApiData(NotificationSettingsSchema)
  @ApiErrors(400, 401)
  update(@CurrentUser() u: AuthUser, @ZBody(UpdateNotificationSettingsSchema) dto: any) {
    return this.svc.updateSettings(u, dto);
  }
}

@Module({
  controllers: [NotificationsController, NotificationSettingsController],
  providers: [NotificationsService, EmailQueueService, RealtimeGateway, { provide: RealtimePublisher, useExisting: RealtimeGateway }],
  exports: [NotificationsService, EmailQueueService, RealtimePublisher],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { StorageModule } from './storage/storage.service';
import { RecurringModule } from './recurring/recurring.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { RateLimitGuard } from './common/rate-limit.guard';
import { MailModule } from './mail/mail.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { AlertsModule } from './alerts/alerts.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_ACTION_SECRET) throw new Error('JWT_ACCESS_SECRET and JWT_ACTION_SECRET are required');
        return { secret: process.env.JWT_ACCESS_SECRET, signOptions: { expiresIn: '15m' } };
      },
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CommonModule,
    StorageModule,
    MailModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    TransactionsModule,
    RecurringModule,
    CategoriesModule,
    BudgetsModule,
    AlertsModule,
    GoalsModule,
    NotificationsModule,
    ReportsModule,
    SubscriptionsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }], // 100 req/min per user; @RateLimit(10) on auth routes
})
export class AppModule {}

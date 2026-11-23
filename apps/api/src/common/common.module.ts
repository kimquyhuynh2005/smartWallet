import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuditService } from './audit.service';
import { DomainEvents } from './domain-events.service';
import { JwtStrategy } from './jwt.strategy';
import { OwnershipGuard } from './ownership.guard';
import { PlanLimitGuard } from './plan-limit.guard';
import { PlanUsageService } from './plan-usage.service';
import { PlansService } from './plans.service';
import { RateLimitGuard } from './rate-limit.guard';
import { ReportCache } from './report-cache.service';
import { RedisService } from './redis.service';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [PassportModule],
  providers: [RedisService, JwtStrategy, PlansService, PlanUsageService, AuditService, DomainEvents, ReportCache, RateLimitGuard, RolesGuard, OwnershipGuard, PlanLimitGuard],
  exports: [RedisService, PlansService, PlanUsageService, AuditService, DomainEvents, ReportCache, RateLimitGuard, RolesGuard, OwnershipGuard, PlanLimitGuard],
})
export class CommonModule {}

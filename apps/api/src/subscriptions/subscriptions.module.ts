import { Controller, HttpCode, Module, Post, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiData, ApiErrors } from '../common/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

// SUB-01: mock checkout, no payment provider. Limits are read from plans.limits on every request.
const CheckoutOut = z.object({ plan: z.literal('PREMIUM'), currentPeriodEnd: z.string().datetime().nullable() });

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private prisma: PrismaService) {}

  @Post('mock-checkout') @HttpCode(200)
  @ApiOperation({ summary: 'SUB-01: mock checkout, switches to Premium for 30 days (no payment provider)' })
  @ApiData(CheckoutOut)
  @ApiErrors(401)
  async checkout(@CurrentUser() u: AuthUser) {
    const premium = await this.prisma.plan.findUniqueOrThrow({ where: { code: 'PREMIUM' } });
    const now = new Date();
    const [, sub] = await this.prisma.$transaction([
      this.prisma.subscription.updateMany({ where: { userId: u.id, status: 'ACTIVE' }, data: { status: 'CANCELED' } }),
      this.prisma.subscription.create({
        data: { userId: u.id, planId: premium.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000), paymentRef: `mock_${randomUUID()}` },
      }),
    ]);
    return { plan: 'PREMIUM', currentPeriodEnd: sub.currentPeriodEnd };
  }
}

@Module({ controllers: [SubscriptionsController] })
export class SubscriptionsModule {}

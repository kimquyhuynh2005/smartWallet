import { Controller, Delete, Get, HttpCode, Module, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BudgetOut, DeleteAccountSchema, OnboardingSchema, UpdateProfileSchema, WalletOut } from '@smartwallet/shared';
import { z } from 'zod';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody } from '../common/swagger';
import { UsersService } from './users.service';

const dt = z.string().datetime();
const MeOut = z.object({
  id: z.string().uuid(), email: z.string(), fullName: z.string(), avatarUrl: z.string().nullable(), role: z.enum(['USER', 'ADMIN']), status: z.enum(['ACTIVE', 'LOCKED']),
  locale: z.string(), currency: z.string(), monthStartDay: z.number().int(), emailVerifiedAt: dt.nullable(), createdAt: dt, hasPassword: z.boolean(), plan: z.enum(['FREE', 'PREMIUM']), onboarded: z.boolean(),
});
const OnboardingOut = z.object({ wallet: WalletOut, budgets: z.array(BudgetOut) });

// Every handler uses the user id from the JWT; there is no :id route, so there is nothing to tamper with.
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'USER-01: my profile' })
  @ApiData(MeOut)
  @ApiErrors(401)
  me(@CurrentUser() u: AuthUser) { return this.svc.me(u.id); }

  @Patch()
  @ApiOperation({ summary: 'USER-01: update name, avatar, currency, language, month_start_day' })
  @ApiData(MeOut)
  @ApiErrors(400, 401)
  update(@CurrentUser() u: AuthUser, @ZBody(UpdateProfileSchema) dto: any) { return this.svc.update(u.id, dto); }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'USER-03: delete my account (soft delete now, purged after 30 days). Password confirmation required for password accounts' })
  @ApiNoContent()
  @ApiErrors(400, 401, 403)
  remove(@CurrentUser() u: AuthUser, @ZBody(DeleteAccountSchema) dto: { password?: string }) { return this.svc.remove(u.id, dto); }

  @Post('onboarding')
  @ApiOperation({ summary: 'USER-02: income -> first wallet -> budget template, in one DB transaction' })
  @ApiData(OnboardingOut, { status: 201 })
  @ApiErrors(400, 401, 409)
  onboarding(@CurrentUser() u: AuthUser, @ZBody(OnboardingSchema) dto: any) { return this.svc.onboard(u.id, dto); }
}

@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}

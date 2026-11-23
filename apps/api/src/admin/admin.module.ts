import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiData, ApiErrors } from '../common/swagger';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

// ADM-01: admins see users + aggregate stats ONLY. No endpoint here may expose individual transactions.
const StatsOut = z.object({ users: z.number().int(), premium: z.number().int() });
const AdminUserOut = z.object({ id: z.string().uuid(), email: z.string(), fullName: z.string(), role: z.enum(['USER', 'ADMIN']), status: z.enum(['ACTIVE', 'LOCKED']), createdAt: z.string().datetime() });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get('stats')
  @ApiOperation({ summary: 'ADM-01: aggregate system stats (never individual transactions)' })
  @ApiData(StatsOut)
  @ApiErrors(401, 403)
  async stats() {
    const [users, premium] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE', deletedAt: null, plan: { code: 'PREMIUM' } } }),
    ]);
    return { users, premium };
  }

  @Get('users')
  @ApiOperation({ summary: 'ADM-01: list users (profile fields only)' })
  @ApiData(AdminUserOut, { array: true })
  @ApiErrors(401, 403)
  users() {
    return this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true }, take: 100 });
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}

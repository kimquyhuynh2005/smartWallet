import { Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CreateWalletSchema, ListWalletsQuerySchema, UpdateWalletSchema, WalletOut } from '@smartwallet/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { Owned, OwnershipGuard } from '../common/ownership.guard';
import { PlanLimit, PlanLimitGuard } from '../common/plan-limit.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody, ZQuery } from '../common/swagger';
import { WalletsService } from './wallets.service';

const IdParam = ApiParam({ name: 'id', format: 'uuid' });

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnershipGuard, PlanLimitGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private svc: WalletsService) {}

  @Get()
  @ApiOperation({ summary: 'List wallets with derived balance (archived hidden unless includeArchived=true)' })
  @ApiData(WalletOut, { array: true })
  @ApiErrors(400, 401)
  list(@CurrentUser() u: AuthUser, @ZQuery(ListWalletsQuerySchema) q: { includeArchived?: boolean }) {
    return this.svc.list(u, q.includeArchived);
  }

  @Post()
  @PlanLimit('max_wallets')
  @ApiOperation({ summary: 'Create a wallet (Free: max 3 active wallets)' })
  @ApiData(WalletOut, { status: 201 })
  @ApiErrors(400, 401, 403)
  create(@CurrentUser() u: AuthUser, @ZBody(CreateWalletSchema) dto: any) {
    return this.svc.create(u, dto);
  }

  @Get(':id')
  @Owned('wallet')
  @IdParam
  @ApiOperation({ summary: 'Get one wallet with its balance' })
  @ApiData(WalletOut)
  @ApiErrors(401, 404)
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Patch(':id')
  @Owned('wallet')
  @IdParam
  @ApiOperation({ summary: 'Update / archive a wallet' })
  @ApiData(WalletOut)
  @ApiErrors(400, 401, 403, 404)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @ZBody(UpdateWalletSchema) dto: any) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @Owned('wallet')
  @HttpCode(204)
  @IdParam
  @ApiOperation({ summary: 'Soft-delete a wallet and its transactions (atomic)' })
  @ApiNoContent()
  @ApiErrors(401, 404)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}

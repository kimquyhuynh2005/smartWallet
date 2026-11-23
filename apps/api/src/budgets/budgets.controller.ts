import { Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApplyTemplateOut, ApplyTemplateSchema, BudgetOut, CreateBudgetSchema, ListBudgetsQuerySchema, RolloverOut, RolloverSchema, UpdateBudgetSchema } from '@smartwallet/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { Owned, OwnershipGuard } from '../common/ownership.guard';
import { PlanLimit, PlanLimitGuard } from '../common/plan-limit.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody, ZQuery } from '../common/swagger';
import { BudgetRolloverService } from './budget-rollover.service';
import { BudgetTemplateService } from './budget-template.service';
import { BudgetsService } from './budgets.service';

const IdParam = ApiParam({ name: 'id', format: 'uuid' });

@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnershipGuard, PlanLimitGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private svc: BudgetsService, private templates: BudgetTemplateService, private rollovers: BudgetRolloverService) {}

  @Get()
  @ApiOperation({ summary: 'BUD-04: budgets of a period (default current) with spent, remaining, percentUsed and safeToSpendToday' })
  @ApiData(BudgetOut, { array: true })
  @ApiErrors(400, 401)
  list(@CurrentUser() u: AuthUser, @ZQuery(ListBudgetsQuerySchema) q: { period?: string }) {
    return this.svc.list(u, q.period);
  }

  @Post()
  @PlanLimit('max_budgets')
  @ApiOperation({ summary: 'BUD-01: create a budget for a period (default current). Free: max 5 per period' })
  @ApiData(BudgetOut, { status: 201 })
  @ApiErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() u: AuthUser, @ZBody(CreateBudgetSchema) dto: any) {
    return this.svc.create(u, dto);
  }

  @Post('apply-template')
  @HttpCode(200)
  @ApiOperation({ summary: 'BUD-02: create budgets from 50/30/20, 6 Jars or custom percentages (must total 100), split by the last 3 months of spending' })
  @ApiData(ApplyTemplateOut)
  @ApiErrors(400, 401, 404, 422)
  applyTemplate(@CurrentUser() u: AuthUser, @ZBody(ApplyTemplateSchema) dto: any) {
    return this.templates.apply(u, dto);
  }

  @Post('rollover')
  @HttpCode(200)
  @ApiOperation({ summary: 'BUD-03: roll the previous period into the target period, carrying unspent money for CARRY_FORWARD budgets (idempotent)' })
  @ApiData(RolloverOut)
  @ApiErrors(400, 401)
  rollover(@CurrentUser() u: AuthUser, @ZBody(RolloverSchema) dto: { period?: string }) {
    return this.rollovers.rollover(u, dto);
  }

  @Patch(':id')
  @Owned('budget')
  @IdParam
  @ApiOperation({ summary: 'Change the limit, rollover mode or (Premium) alert thresholds' })
  @ApiData(BudgetOut)
  @ApiErrors(400, 401, 403, 404)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @ZBody(UpdateBudgetSchema) dto: any) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @Owned('budget')
  @HttpCode(204)
  @IdParam
  @ApiOperation({ summary: 'Delete a budget (soft)' })
  @ApiNoContent()
  @ApiErrors(401, 404)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}

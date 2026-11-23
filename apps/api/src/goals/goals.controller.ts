import { Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ContributionResultOut, ContributionSchema, CreateGoalSchema, GoalOut, UpdateGoalSchema } from '@smartwallet/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { Owned, OwnershipGuard } from '../common/ownership.guard';
import { PlanLimit, PlanLimitGuard } from '../common/plan-limit.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody } from '../common/swagger';
import { GoalsService } from './goals.service';

const IdParam = ApiParam({ name: 'id', format: 'uuid' });

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnershipGuard, PlanLimitGuard)
@Controller('goals')
export class GoalsController {
  constructor(private svc: GoalsService) {}

  @Get()
  @ApiOperation({ summary: 'GOAL-02: goals with progress and required monthly saving' })
  @ApiData(GoalOut, { array: true })
  @ApiErrors(401)
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u);
  }

  @Post()
  @PlanLimit('max_goals')
  @ApiOperation({ summary: 'GOAL-01: create a goal (Free: max 2 active)' })
  @ApiData(GoalOut, { status: 201 })
  @ApiErrors(400, 401, 403, 404)
  create(@CurrentUser() u: AuthUser, @ZBody(CreateGoalSchema) dto: any) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @Owned('goal')
  @IdParam
  @ApiOperation({ summary: 'Update a goal; status ACTIVE/CANCELED (ACHIEVED is derived from saved vs target)' })
  @ApiData(GoalOut)
  @ApiErrors(400, 401, 403, 404)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @ZBody(UpdateGoalSchema) dto: any) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @Owned('goal')
  @HttpCode(204)
  @IdParam
  @ApiOperation({ summary: 'Soft-delete a goal and its contributions' })
  @ApiNoContent()
  @ApiErrors(401, 404)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }

  @Post(':id/contributions')
  @Owned('goal')
  @IdParam
  @ApiOperation({ summary: 'GOAL-02: add (+) or withdraw (-) savings; goal flips to ACHIEVED when saved >= target' })
  @ApiData(ContributionResultOut, { status: 201 })
  @ApiErrors(400, 401, 404, 409, 422)
  contribute(@CurrentUser() u: AuthUser, @Param('id') id: string, @ZBody(ContributionSchema) dto: any) {
    return this.svc.contribute(u, id, dto);
  }
}

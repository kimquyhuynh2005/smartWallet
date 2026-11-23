import { Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CreateRecurringRuleSchema, RecurringRuleOut, UpdateRecurringRuleSchema } from '@smartwallet/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { Owned, OwnershipGuard } from '../common/ownership.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody } from '../common/swagger';
import { RecurringService } from './recurring.service';

const IdParam = ApiParam({ name: 'id', format: 'uuid' });

@ApiTags('recurring-rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnershipGuard)
@Controller('recurring-rules')
export class RecurringController {
  constructor(private svc: RecurringService) {}

  @Get()
  @ApiOperation({ summary: 'TXN-05: list recurring rules' })
  @ApiData(RecurringRuleOut, { array: true })
  @ApiErrors(401)
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u);
  }

  @Post()
  @ApiOperation({ summary: 'TXN-05: create a daily/weekly/monthly rule; a background job posts due transactions' })
  @ApiData(RecurringRuleOut, { status: 201 })
  @ApiErrors(400, 401, 404, 409, 422)
  create(@CurrentUser() u: AuthUser, @ZBody(CreateRecurringRuleSchema) dto: any) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @Owned('recurringRule')
  @IdParam
  @ApiOperation({ summary: 'Update a rule (affects future runs only)' })
  @ApiData(RecurringRuleOut)
  @ApiErrors(400, 401, 404, 409, 422)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @ZBody(UpdateRecurringRuleSchema) dto: any) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @Owned('recurringRule')
  @HttpCode(204)
  @IdParam
  @ApiOperation({ summary: 'Stop a rule (already generated transactions are kept)' })
  @ApiNoContent()
  @ApiErrors(401, 404)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}

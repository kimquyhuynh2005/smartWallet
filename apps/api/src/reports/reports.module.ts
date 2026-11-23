import { Controller, Get, Injectable, Module, UseGuards, Res } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ByCategoryOut, ByCategoryQuerySchema, DailyOut, DashboardOut, ExportQuerySchema, ReportPeriodQuerySchema, TrendOut, TrendQuerySchema } from '@smartwallet/shared';
import type { Response } from 'express';
import { BudgetsModule } from '../budgets/budgets.module';
import { CurrentUser } from '../common/current-user.decorator';
import { GOAL_CONTRIBUTION_CHANGED, GoalContributionChangedEvent, TRANSACTION_CHANGED, TransactionChangedEvent } from '../common/events';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { PlanLimitGuard, PremiumOnly } from '../common/plan-limit.guard';
import { ReportCache } from '../common/report-cache.service';
import { ApiData, ApiErrors, ZQuery } from '../common/swagger';
import { GoalsModule } from '../goals/goals.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlanLimitGuard)
@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'RPT-01: the whole dashboard in one call (totals, wallets, budgets, top categories, daily spending, 6-period trend, goals, recent). Cached 60 s' })
  @ApiData(DashboardOut)
  @ApiErrors(400, 401, 403)
  dashboard(@CurrentUser() u: AuthUser, @ZQuery(ReportPeriodQuerySchema) q: { period?: string }) {
    return this.svc.dashboard(u, q.period);
  }

  @Get('by-category')
  @ApiOperation({ summary: 'RPT-02: spending (or income) by category for the donut chart' })
  @ApiData(ByCategoryOut)
  @ApiErrors(400, 401, 403)
  byCategory(@CurrentUser() u: AuthUser, @ZQuery(ByCategoryQuerySchema) q: { period?: string; type: 'INCOME' | 'EXPENSE' }) {
    return this.svc.byCategory(u, q);
  }

  @Get('trend')
  @ApiOperation({ summary: 'RPT-02: income/expense per period for the last N periods. Free: at most 6 (403 PLAN_LIMIT_REACHED), Premium: up to 12' })
  @ApiData(TrendOut)
  @ApiErrors(400, 401, 403)
  trend(@CurrentUser() u: AuthUser, @ZQuery(TrendQuerySchema) q: { months: number }) {
    return this.svc.trend(u, q.months);
  }

  @Get('daily')
  @ApiOperation({ summary: 'RPT-02: income and expense for every day of the period (Vietnam calendar days, zero-filled)' })
  @ApiData(DailyOut)
  @ApiErrors(400, 401, 403)
  daily(@CurrentUser() u: AuthUser, @ZQuery(ReportPeriodQuerySchema) q: { period?: string }) {
    return this.svc.daily(u, q.period);
  }

  @Get('export')
  @PremiumOnly('csv_export')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'RPT-03 (Premium): download the period\'s transactions as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file (UTF-8 with BOM)', content: { 'text/csv': { schema: { type: 'string' } } } })
  @ApiErrors(400, 401, 403, 422)
  async export(@CurrentUser() u: AuthUser, @ZQuery(ExportQuerySchema) q: { period?: string }, @Res() res: Response) {
    const { filename, body } = await this.svc.exportCsv(u, q.period);
    res.status(200).setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="${filename}"`).send(body);
  }
}

/** report numbers change whenever money moves: drop the user's cached reports right away (the 60 s TTL is only the safety net) */
@Injectable()
export class ReportCacheListener {
  constructor(private cache: ReportCache) {}
  @OnEvent(TRANSACTION_CHANGED) onTransaction(e: TransactionChangedEvent) { return this.cache.bump(e.userId); }
  @OnEvent(GOAL_CONTRIBUTION_CHANGED) onGoal(e: GoalContributionChangedEvent) { return this.cache.bump(e.userId); }
}

@Module({
  imports: [WalletsModule, BudgetsModule, GoalsModule, TransactionsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportCacheListener],
})
export class ReportsModule {}

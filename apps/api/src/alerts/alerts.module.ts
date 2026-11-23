import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertJobsScheduler } from './alert-jobs.scheduler';
import { BudgetEvaluator } from './budget-evaluator.service';
import { GoalCheckService } from './goal-check.service';
import { WeeklySummaryService } from './weekly-summary.service';

@Module({
  imports: [BudgetsModule, NotificationsModule],
  providers: [BudgetEvaluator, WeeklySummaryService, GoalCheckService, AlertJobsScheduler],
  exports: [BudgetEvaluator],
})
export class AlertsModule {}

import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetRolloverService } from './budget-rollover.service';
import { BudgetTemplateService } from './budget-template.service';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';

@Module({
  imports: [CategoriesModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetTemplateService, BudgetRolloverService],
  exports: [BudgetsService],
})
export class BudgetsModule {}

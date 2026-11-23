import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { WalletsModule } from '../wallets/wallets.module';
import { RecurringController } from './recurring.controller';
import { RecurringScheduler } from './recurring.scheduler';
import { RecurringService } from './recurring.service';

@Module({ imports: [WalletsModule, CategoriesModule], controllers: [RecurringController], providers: [RecurringService, RecurringScheduler], exports: [RecurringService, RecurringScheduler] })
export class RecurringModule {}

import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ImportService } from './import.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [WalletsModule, CategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, ImportService],
  exports: [TransactionsRepository, TransactionsService],
})
export class TransactionsModule {}

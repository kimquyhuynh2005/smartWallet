import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({ imports: [WalletsModule], controllers: [GoalsController], providers: [GoalsService], exports: [GoalsService] })
export class GoalsModule {}

import { Module } from '@nestjs/common';
import { CATEGORIZER } from './categorizer';
import { CategorizationService } from './categorization.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { KeywordHistoryCategorizer } from './keyword-categorizer';

@Module({
  controllers: [CategoriesController],
  // swap KeywordHistoryCategorizer for an ML-backed class here; nothing else changes
  providers: [CategoriesService, CategorizationService, KeywordHistoryCategorizer, { provide: CATEGORIZER, useExisting: KeywordHistoryCategorizer }],
  exports: [CategoriesService, CategorizationService],
})
export class CategoriesModule {}

import { Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CategoryOut, CreateCategorySchema, ListCategoriesQuerySchema, SuggestCategoryBodySchema, SuggestCategoryOut, UpdateCategorySchema } from '@smartwallet/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody, ZQuery } from '../common/swagger';
import { CategorizationService } from './categorization.service';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private svc: CategoriesService, private categorization: CategorizationService) {}

  @Get()
  @ApiOperation({ summary: 'List system default categories (vi/en) plus the user\'s own' })
  @ApiData(CategoryOut, { array: true })
  @ApiErrors(400, 401)
  list(@CurrentUser() u: AuthUser, @ZQuery(ListCategoriesQuerySchema) q: { type?: 'INCOME' | 'EXPENSE' }) {
    return this.svc.list(u.id, q.type);
  }

  @Post('suggest')
  @HttpCode(200)
  @ApiOperation({ summary: 'CAT-03: top 3 category suggestions with confidence (pre-select the first when confidence >= 0.6)' })
  @ApiData(SuggestCategoryOut)
  @ApiErrors(400, 401)
  suggest(@CurrentUser() u: AuthUser, @ZBody(SuggestCategoryBodySchema) body: { note: string; amount?: number; type?: 'INCOME' | 'EXPENSE' }) {
    return this.categorization.suggest(u.id, body);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom category or sub-category (max 2 levels)' })
  @ApiData(CategoryOut, { status: 201 })
  @ApiErrors(400, 401, 404, 422)
  create(@CurrentUser() u: AuthUser, @ZBody(CreateCategorySchema) dto: any) {
    return this.svc.create(u.id, dto);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Update a custom category (system defaults are read-only: 403 SYSTEM_CATEGORY_READONLY)' })
  @ApiData(CategoryOut)
  @ApiErrors(400, 401, 403, 404, 422)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @ZBody(UpdateCategorySchema) dto: any) {
    return this.svc.update(u.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Delete a custom category and its sub-categories (system defaults cannot be deleted)' })
  @ApiNoContent()
  @ApiErrors(401, 403, 404)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }
}

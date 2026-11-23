import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { normalizeText } from '@smartwallet/shared';
import { isUuid } from '../common/uuid';
import { PrismaService } from '../prisma/prisma.service';

export interface SuggestRule { keyword: string; categoryId: string; weight: number; isUser: boolean }

/**
 * CAT-03: whole-word/phrase match on the diacritic-free note ("be" must not match "ben").
 * Priority: user rules > global, then weight, then longer (more specific) keyword.
 */
export function suggestCategory(note: string, rules: SuggestRule[]): string | null {
  const hay = ` ${normalizeText(note)} `;
  const hits = rules.filter((r) => r.keyword && hay.includes(` ${normalizeText(r.keyword)} `));
  hits.sort((a, b) => Number(b.isUser) - Number(a.isUser) || b.weight - a.weight || b.keyword.length - a.keyword.length);
  return hits[0]?.categoryId ?? null;
}

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' });
const depth = () => new UnprocessableEntityException({ code: 'CATEGORY_DEPTH_EXCEEDED', message: 'Categories can be nested at most 2 levels' });
const typeMismatch = (m = 'Category type does not match') => new UnprocessableEntityException({ code: 'CATEGORY_TYPE_MISMATCH', message: m });

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  present(c: Category) {
    return { id: c.id, isSystem: c.userId === null, parentId: c.parentId, nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, icon: c.icon, color: c.color };
  }

  /** CAT-01/02: system defaults (user_id NULL) + the caller's own. */
  visible(userId: string, type?: 'INCOME' | 'EXPENSE') {
    return this.prisma.category.findMany({
      where: { deletedAt: null, OR: [{ userId: null }, { userId }], ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { nameEn: 'asc' }],
    });
  }

  async list(userId: string, type?: 'INCOME' | 'EXPENSE') {
    return (await this.visible(userId, type)).map((c) => this.present(c));
  }

  private async findVisible(userId: string, id: string): Promise<Category> {
    const c = isUuid(id) ? await this.prisma.category.findFirst({ where: { id, deletedAt: null, OR: [{ userId: null }, { userId }] } }) : null;
    if (!c) throw notFound();
    return c;
  }

  private async findOwn(userId: string, id: string): Promise<Category> {
    const c = await this.findVisible(userId, id);
    if (c.userId === null) throw new ForbiddenException({ code: 'SYSTEM_CATEGORY_READONLY', message: 'Default categories cannot be changed or deleted' });
    return c;
  }

  /** Used by transactions/recurring/import: the category must be visible to the user and match the transaction type. */
  async assertUsable(userId: string, categoryId: string, type: 'INCOME' | 'EXPENSE') {
    const c = await this.findVisible(userId, categoryId);
    if (c.type !== type) throw typeMismatch(`A ${c.type} category cannot be used on a ${type} transaction`);
    return c;
  }

  async create(userId: string, dto: { nameVi: string; nameEn: string; type: 'INCOME' | 'EXPENSE'; parentId?: string | null; icon?: string; color?: string }) {
    if (dto.parentId) {
      const parent = await this.findVisible(userId, dto.parentId);
      if (parent.parentId !== null) throw depth();
      if (parent.type !== dto.type) throw typeMismatch('A sub-category must have the same type as its parent');
    }
    const c = await this.prisma.category.create({
      data: { userId, nameVi: dto.nameVi, nameEn: dto.nameEn, type: dto.type, parentId: dto.parentId ?? null, icon: dto.icon, color: dto.color },
    });
    return this.present(c);
  }

  async update(userId: string, id: string, dto: { nameVi?: string; nameEn?: string; icon?: string | null; color?: string | null; parentId?: string | null }) {
    const c = await this.findOwn(userId, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw depth();
      const parent = await this.findVisible(userId, dto.parentId);
      if (parent.parentId !== null) throw depth();
      if (parent.type !== c.type) throw typeMismatch('A sub-category must have the same type as its parent');
      if (await this.prisma.category.count({ where: { parentId: id, deletedAt: null } })) throw depth(); // it already has children: it would become level 3
    }
    return this.present(await this.prisma.category.update({ where: { id }, data: dto }));
  }

  /** System defaults are immutable. Deleting also removes sub-categories and their budgets/rules (atomic); past transactions keep their category for history. */
  async remove(userId: string, id: string) {
    await this.findOwn(userId, id);
    await this.prisma.$transaction(async (tx) => {
      const ids = [id, ...(await tx.category.findMany({ where: { parentId: id, userId, deletedAt: null }, select: { id: true } })).map((c) => c.id)];
      const now = new Date();
      await tx.category.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });
      await tx.budget.updateMany({ where: { userId, categoryId: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
      await tx.categoryRule.updateMany({ where: { userId, categoryId: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
    });
  }

  async loadRules(userId: string): Promise<SuggestRule[]> {
    const rows = await this.prisma.categoryRule.findMany({ where: { deletedAt: null, OR: [{ userId: null }, { userId }], category: { deletedAt: null } } });
    return rows.map((r) => ({ keyword: r.keyword, categoryId: r.categoryId, weight: r.weight, isUser: r.userId !== null }));
  }
}

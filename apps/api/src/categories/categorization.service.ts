import { Inject, Injectable, Logger } from '@nestjs/common';
import { preselectCategory } from '@smartwallet/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CATEGORIZER, CategorizerStrategy, ScoredSuggestion, informativeTokens } from './categorizer';
import { CategoriesService } from './categories.service';

/** CAT-03 + CAT-04: suggestions for the form, and learning from the user's overrides. Talks to the strategy only through its interface. */
@Injectable()
export class CategorizationService {
  private log = new Logger('Categorization');

  constructor(@Inject(CATEGORIZER) private strategy: CategorizerStrategy, private prisma: PrismaService, private categories: CategoriesService) {}

  async suggest(userId: string, body: { note: string; amount?: number; type?: 'INCOME' | 'EXPENSE' }) {
    const scored = await this.strategy.suggest({ userId, ...body });
    const visible = new Map((await this.categories.visible(userId)).map((c) => [c.id, c]));
    const suggestions = scored
      .filter((s) => visible.has(s.categoryId))
      .map((s) => {
        const c = visible.get(s.categoryId)!;
        return { categoryId: s.categoryId, confidence: s.confidence, nameVi: c.nameVi, nameEn: c.nameEn, type: c.type, reasons: s.reasons };
      });
    return { suggestions, preselectedCategoryId: preselectCategory(suggestions) };
  }

  /** The category we WOULD have suggested for this note, computed before the new transaction exists (so it cannot bias itself). */
  async top(userId: string, note: string, amount?: number, type?: 'INCOME' | 'EXPENSE'): Promise<ScoredSuggestion | null> {
    return (await this.strategy.suggest({ userId, note, amount, type }))[0] ?? null;
  }

  /**
   * CAT-04. If the user chose something other than what we suggested, remember it: for every informative token of the note,
   * upsert the personal rule (token -> chosen category) and bump hits. Personal rules that pointed the same token at a different
   * category lose a hit and are retired at zero, so the model converges instead of piling up contradictions.
   * Returns the number of tokens learned. Accepting the suggestion teaches nothing new.
   */
  async learn(userId: string, c: { note?: string | null; categoryId: string; suggestedCategoryId: string | null }): Promise<number> {
    if (!c.note || c.suggestedCategoryId === c.categoryId) return 0;
    const tokens = informativeTokens(c.note);
    if (!tokens.length) return 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const keyword of tokens) {
          // race-free upsert on the partial unique index (user_id, keyword, category_id)
          await tx.$executeRaw`
            INSERT INTO category_rules (id, user_id, keyword, category_id, weight, hits, created_at, updated_at)
            VALUES (gen_random_uuid(), ${userId}::uuid, ${keyword}, ${c.categoryId}::uuid, 1, 1, now(), now())
            ON CONFLICT (user_id, keyword, category_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL
            DO UPDATE SET hits = category_rules.hits + 1, updated_at = now()`;
          await tx.categoryRule.updateMany({ where: { userId, keyword, deletedAt: null, categoryId: { not: c.categoryId } }, data: { hits: { decrement: 1 } } });
          await tx.categoryRule.updateMany({ where: { userId, keyword, deletedAt: null, hits: { lte: 0 } }, data: { deletedAt: new Date() } });
        }
      });
    } catch (e) {
      this.log.error(`learning failed: ${(e as Error).message}`); // never let learning break saving a transaction
      return 0;
    }
    return tokens.length;
  }
}

import { Injectable } from '@nestjs/common';
import { normalizeText } from '@smartwallet/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CategorizerStrategy, ScoredSuggestion, SuggestInput, SuggestReason, confidenceOf, informativeTokens } from './categorizer';

export const PERSONAL_MULTIPLIER = 3; // the user's own rules count three times a global keyword
export const GLOBAL_MULTIPLIER = 1;
export const HISTORY_DAYS = 90;
const HISTORY_BASE = 1; // boost for a token the user categorised once in the last 90 days
const HISTORY_STEP = 0.25; // +0.25 per additional time, capped at +1 (5 times)
const HISTORY_STEPS_MAX = 4;
const AMOUNT_BOOST = 0.5;
const MIN_AMOUNT_SAMPLES = 3;
const HISTORY_ROWS = 3000;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Score = personal rules (weight x3) + global keywords (weight x1) + history boost (the category this user picked most often
 * for the same token in the last 90 days) + a small boost when the amount is typical for the category. Top 3 by confidence.
 */
@Injectable()
export class KeywordHistoryCategorizer implements CategorizerStrategy {
  readonly name = 'keyword-history-v1';
  constructor(private prisma: PrismaService) {}

  async suggest({ userId, note, amount, type, now = new Date() }: SuggestInput): Promise<ScoredSuggestion[]> {
    const normalized = normalizeText(note);
    if (!normalized) return [];
    const hay = ` ${normalized} `;
    const tokens = informativeTokens(note, 8);
    const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);

    const [rules, history] = await Promise.all([
      this.prisma.categoryRule.findMany({ where: { deletedAt: null, OR: [{ userId: null }, { userId }], category: { deletedAt: null } } }),
      this.prisma.transaction.findMany({
        where: { userId, deletedAt: null, categoryId: { not: null }, note: { not: null }, type: { in: ['INCOME', 'EXPENSE'] }, occurredAt: { gte: since } },
        select: { categoryId: true, note: true, amount: true },
        orderBy: { occurredAt: 'desc' },
        take: HISTORY_ROWS,
      }),
    ]);

    const scores = new Map<string, { score: number; reasons: Set<SuggestReason> }>();
    const add = (id: string, pts: number, why: SuggestReason) => {
      const e = scores.get(id) ?? { score: 0, reasons: new Set<SuggestReason>() };
      e.score += pts;
      e.reasons.add(why);
      scores.set(id, e);
    };

    for (const r of rules) {
      const kw = normalizeText(r.keyword);
      if (kw && hay.includes(` ${kw} `)) {
        const personal = r.userId !== null;
        add(r.categoryId, r.weight * (personal ? PERSONAL_MULTIPLIER : GLOBAL_MULTIPLIER), personal ? 'personal_rule' : 'global_keyword');
      }
    }

    // history: for each token of the note, the category this user chose most often for notes containing that token
    const perToken = new Map<string, Map<string, number>>(tokens.map((t) => [t, new Map()]));
    const amounts = new Map<string, number[]>();
    for (const h of history) {
      const cat = h.categoryId!;
      (amounts.get(cat) ?? amounts.set(cat, []).get(cat)!).push(Number(h.amount));
      const words = new Set(normalizeText(h.note ?? '').split(' '));
      for (const t of tokens) if (words.has(t)) perToken.get(t)!.set(cat, (perToken.get(t)!.get(cat) ?? 0) + 1);
    }
    for (const counts of perToken.values()) {
      let best: [string, number] | null = null;
      for (const [cat, n] of counts) if (!best || n > best[1]) best = [cat, n];
      if (best) add(best[0], HISTORY_BASE + Math.min(best[1] - 1, HISTORY_STEPS_MAX) * HISTORY_STEP, 'history');
    }

    // amount: only nudges categories that already have other evidence
    if (amount) {
      for (const [cat, entry] of scores) {
        const xs = amounts.get(cat);
        if (xs && xs.length >= MIN_AMOUNT_SAMPLES) {
          const m = median(xs);
          if (amount >= m * 0.5 && amount <= m * 2) add(cat, AMOUNT_BOOST, 'amount');
        }
        void entry;
      }
    }

    let candidates = [...scores.entries()];
    if (type || candidates.length) {
      const cats = await this.prisma.category.findMany({ where: { id: { in: candidates.map(([id]) => id) }, deletedAt: null }, select: { id: true, type: true } });
      const ok = new Set(cats.filter((c) => !type || c.type === type).map((c) => c.id));
      candidates = candidates.filter(([id]) => ok.has(id));
    }
    const total = candidates.reduce((a, [, e]) => a + e.score, 0);
    return candidates
      .map(([categoryId, e]) => ({ categoryId, score: e.score, confidence: confidenceOf(e.score, total), reasons: [...e.reasons] }))
      .sort((a, b) => b.confidence - a.confidence || b.score - a.score || a.categoryId.localeCompare(b.categoryId))
      .slice(0, 3)
      .map(({ categoryId, confidence, reasons }) => ({ categoryId, confidence, reasons }));
  }
}

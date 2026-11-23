import { normalizeText } from '@smartwallet/shared';

export type SuggestReason = 'personal_rule' | 'global_keyword' | 'history' | 'amount';

export interface SuggestInput {
  userId: string;
  note: string;
  amount?: number;
  type?: 'INCOME' | 'EXPENSE';
  now?: Date;
}

export interface ScoredSuggestion {
  categoryId: string;
  /** 0..1, rounded to 2 decimals */
  confidence: number;
  reasons: SuggestReason[];
}

/**
 * CAT-03 extension point. The API (`POST /categories/suggest`) only talks to this interface, so an ML model can replace the
 * keyword/history implementation by providing another class for the CATEGORIZER token; request and response shapes do not change.
 */
export interface CategorizerStrategy {
  readonly name: string;
  suggest(input: SuggestInput): Promise<ScoredSuggestion[]>;
}
export const CATEGORIZER = Symbol('CategorizerStrategy');

/** Words that carry no category signal. Learning from them would only add noise. */
const STOPWORDS = new Set([
  'di', 'o', 'tai', 'cho', 'va', 'la', 'cua', 'cac', 'mot', 'nhung', 'voi', 'de', 'tu', 'den', 've', 'trong', 'tren', 'thang', 'ngay', 'hom', 'nay', 'qua',
  'tien', 'mon', 'lan', 'the', 'and', 'for', 'of', 'at', // NOT 'an' / 'to' / 'in' / 'on': after stripping diacritics they are Vietnamese words (ăn = eat, tô = bowl, in = print)
]);

/** lower-case, diacritics stripped ("cà phê" -> "ca phe"), split into tokens */
export const tokenize = (note: string): string[] => normalizeText(note).split(' ').filter(Boolean);

/** Tokens worth learning / counting: unique, length >= 2, not numeric, not a stop word. */
export function informativeTokens(note: string, max = 5): string[] {
  const out: string[] = [];
  for (const t of tokenize(note)) {
    if (t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t) && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * confidence = share of the total score x strength of the evidence, strength = 1 - e^(-score).
 *   one global keyword (score 1)   -> 0.63   (>= 0.6: pre-selected)
 *   one personal rule  (score 3)   -> 0.95
 *   two equally good competitors   -> about half of that
 */
export function confidenceOf(score: number, total: number): number {
  if (score <= 0 || total <= 0) return 0;
  return Math.round((score / total) * (1 - Math.exp(-score)) * 100) / 100;
}

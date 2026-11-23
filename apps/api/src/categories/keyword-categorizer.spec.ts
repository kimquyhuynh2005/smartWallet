import { PRESELECT_CONFIDENCE } from '@smartwallet/shared';
import { UID, mockPrisma } from '../testing/mocks';
import { confidenceOf, informativeTokens, tokenize } from './categorizer';
import { HISTORY_DAYS, KeywordHistoryCategorizer } from './keyword-categorizer';

const FOOD = UID(10), TRANSPORT = UID(11), SHOP = UID(12), SALARY = UID(13);
const NOW = new Date('2026-11-21T05:00:00Z');
const rule = (keyword: string, categoryId: string, over: Record<string, unknown> = {}) => ({ keyword, categoryId, weight: 1, userId: null, ...over });
const hist = (note: string, categoryId: string, amount = 50_000) => ({ note, categoryId, amount: BigInt(amount) });

function setup(rules: any[] = [], history: any[] = [], cats = [FOOD, TRANSPORT, SHOP, SALARY]) {
  const prisma = mockPrisma(['categoryRule', 'transaction', 'category']);
  prisma.categoryRule.findMany.mockResolvedValue(rules);
  prisma.transaction.findMany.mockResolvedValue(history);
  prisma.category.findMany.mockImplementation(async ({ where }: any) => where.id.in.filter((id: string) => cats.includes(id)).map((id: string) => ({ id, type: id === SALARY ? 'INCOME' : 'EXPENSE' })));
  return { c: new KeywordHistoryCategorizer(prisma), prisma };
}
const ask = (c: KeywordHistoryCategorizer, note: string, extra: object = {}) => c.suggest({ userId: 'u1', note, now: NOW, ...extra });

describe('CAT-03 normalisation', () => {
  it('lower-cases, strips Vietnamese diacritics and tokenizes: "Cà phê" -> ["ca","phe"]', () => {
    expect(tokenize('Cà phê')).toEqual(['ca', 'phe']);
    expect(tokenize('  Đi GRAB, về nhà!! ')).toEqual(['di', 'grab', 've', 'nha']);
    expect(tokenize('Trà sữa Phúc Long 45k')).toEqual(['tra', 'sua', 'phuc', 'long', '45k']);
  });
  it('informativeTokens drops stop words, numbers, single letters and duplicates, and caps the count', () => {
    expect(informativeTokens('Đi Grab về nhà 2026 grab')).toEqual(['grab', 'nha']);
    expect(informativeTokens('a b c an trua')).toEqual(['an', 'trua']);
    expect(informativeTokens('một hai ba bốn năm sáu bảy tám chín', 3)).toHaveLength(3);
  });
});

describe('CAT-03 confidence', () => {
  it('single global keyword = 0.63 (>= 0.6 so the form pre-selects it); single personal rule = 0.95', () => {
    expect(confidenceOf(1, 1)).toBe(0.63);
    expect(confidenceOf(1, 1)).toBeGreaterThanOrEqual(PRESELECT_CONFIDENCE);
    expect(confidenceOf(3, 3)).toBe(0.95);
  });
  it('competition lowers confidence; nothing scores 0', () => {
    expect(confidenceOf(1, 2)).toBeLessThan(PRESELECT_CONFIDENCE);
    expect(confidenceOf(0, 0)).toBe(0);
  });
});

describe('KeywordHistoryCategorizer scoring', () => {
  it('matches "ca phe" inside "Cà phê Highlands" by diacritic-free whole phrase, with reason global_keyword', async () => {
    const { c } = setup([rule('ca phe', FOOD), rule('highlands', FOOD)]);
    const [top] = await ask(c, 'Cà phê Highlands');
    expect(top).toMatchObject({ categoryId: FOOD, reasons: ['global_keyword'] });
    expect(top.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('whole words only: "be" must not match "bên hồ"', async () => {
    const { c } = setup([rule('be', TRANSPORT)]);
    expect(await ask(c, 'ngồi bên hồ')).toEqual([]);
    expect((await ask(c, 'Be đi học'))[0].categoryId).toBe(TRANSPORT);
  });

  it('personal rules count x3, global x1: a personal rule beats a global one for the same word', async () => {
    const { c } = setup([rule('grab', TRANSPORT), rule('grab', FOOD, { userId: 'u1' })]);
    const out = await ask(c, 'grab');
    expect(out.map((s) => s.categoryId)).toEqual([FOOD, TRANSPORT]);
    expect(out[0].reasons).toEqual(['personal_rule']);
    // scores 3 vs 1 -> shares 0.75/0.25
    expect(out[0].confidence).toBe(confidenceOf(3, 4));
    expect(out[1].confidence).toBe(confidenceOf(1, 4));
  });

  it('rule weight multiplies the score', async () => {
    const { c } = setup([rule('grab', TRANSPORT, { weight: 2 }), rule('grab', FOOD, { weight: 1 })]);
    expect((await ask(c, 'grab'))[0].categoryId).toBe(TRANSPORT);
  });

  it('history boost: the category the user most often picked for the same token in the last 90 days', async () => {
    const { c } = setup([], [hist('Trà sữa Gong Cha', FOOD), hist('trà sữa Koi', FOOD), hist('Trà xanh', SHOP)]);
    const out = await ask(c, 'trà sữa');
    expect(out[0]).toMatchObject({ categoryId: FOOD, reasons: ['history'] });
  });
  it('the history boost grows with repetition (1.0 for once, +0.25 per extra pick, capped at +1)', async () => {
    const once = (await ask(setup([], [hist('highlands', FOOD)]).c, 'highlands'))[0];
    const many = (await ask(setup([], Array.from({ length: 9 }, () => hist('highlands', FOOD))).c, 'highlands'))[0];
    expect(once.confidence).toBe(confidenceOf(1, 1));
    expect(many.confidence).toBe(confidenceOf(2, 2));
    expect(many.confidence).toBeGreaterThan(once.confidence);
  });
  it('for each token only the MOST frequent category gets the boost', async () => {
    const { c } = setup([], [hist('grab', TRANSPORT), hist('grab', TRANSPORT), hist('grab', FOOD)]);
    const out = await ask(c, 'grab');
    expect(out).toHaveLength(1);
    expect(out[0].categoryId).toBe(TRANSPORT);
  });
  it('history only looks at the last 90 days (the query window), never at other users', async () => {
    const { c, prisma } = setup();
    await ask(c, 'grab');
    const where = prisma.transaction.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.occurredAt.gte).toEqual(new Date(NOW.getTime() - HISTORY_DAYS * 86_400_000));
    expect(HISTORY_DAYS).toBe(90);
  });
  it('history is matched on diacritic-free whole tokens and stop words never count', async () => {
    const { c } = setup([], [hist('Đi ăn với bạn', FOOD)]);
    expect(await ask(c, 'đi')).toEqual([]); // "di" is a stop word
    expect((await ask(c, 'ăn trưa'))[0].categoryId).toBe(FOOD); // "an" appears in the past note
  });

  it('personal + history + global stack up and list every reason', async () => {
    const { c } = setup([rule('grab', TRANSPORT), rule('grab', TRANSPORT, { userId: 'u1' })], [hist('grab bike', TRANSPORT)]);
    const [top] = await ask(c, 'grab');
    expect(top.reasons.sort()).toEqual(['global_keyword', 'history', 'personal_rule']);
    expect(top.confidence).toBe(confidenceOf(5, 5));
  });

  it('a typical amount nudges a category that already has evidence (needs >= 3 samples, within 0.5x-2x of the median)', async () => {
    const hs = [hist('cafe a', FOOD, 40_000), hist('cafe b', FOOD, 50_000), hist('cafe c', FOOD, 60_000)];
    const near = await ask(setup([rule('highlands', FOOD)], hs).c, 'highlands', { amount: 55_000 });
    const far = await ask(setup([rule('highlands', FOOD)], hs).c, 'highlands', { amount: 5_000_000 });
    expect(near[0].reasons).toContain('amount');
    expect(far[0].reasons).not.toContain('amount');
    const few = await ask(setup([rule('highlands', FOOD)], hs.slice(0, 2)).c, 'highlands', { amount: 55_000 });
    expect(few[0].reasons).not.toContain('amount');
  });
  it('the amount alone never invents a suggestion', async () => {
    const hs = [hist('x1', FOOD), hist('x2', FOOD), hist('x3', FOOD)];
    expect(await ask(setup([], hs).c, 'zzz unknown', { amount: 50_000 })).toEqual([]);
  });

  it('returns at most 3 suggestions, best first, with deterministic tie-breaking', async () => {
    const { c } = setup([rule('a1', FOOD), rule('a1', TRANSPORT), rule('a1', SHOP), rule('a1', SALARY)]);
    const out = await ask(c, 'a1');
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.categoryId)).toEqual([...out.map((s) => s.categoryId)].sort()); // equal scores -> stable id order
  });
  it('filters by transaction type and ignores deleted categories', async () => {
    const { c } = setup([rule('luong', SALARY), rule('luong', FOOD)]);
    expect((await ask(c, 'lương', { type: 'INCOME' })).map((s) => s.categoryId)).toEqual([SALARY]);
    expect((await ask(c, 'lương', { type: 'EXPENSE' })).map((s) => s.categoryId)).toEqual([FOOD]);
    const gone = setup([rule('luong', FOOD)], [], []); // category no longer exists
    expect(await ask(gone.c, 'lương')).toEqual([]);
  });
  it('queries personal AND global rules but only live categories', async () => {
    const { c, prisma } = setup();
    await ask(c, 'grab');
    expect(prisma.categoryRule.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, OR: [{ userId: null }, { userId: 'u1' }], category: { deletedAt: null } });
  });
  it('empty or symbol-only notes return nothing and touch no data', async () => {
    const { c, prisma } = setup([rule('grab', TRANSPORT)]);
    expect(await ask(c, '')).toEqual([]);
    expect(await ask(c, ' !!! ')).toEqual([]);
    expect(prisma.categoryRule.findMany).not.toHaveBeenCalled();
  });
});

import { UID, mockPrisma } from '../testing/mocks';
import { CategorizationService } from './categorization.service';
import type { CategorizerStrategy } from './categorizer';

const FOOD = UID(10), TRANSPORT = UID(11);
const visible = [
  { id: FOOD, nameVi: 'Ăn uống', nameEn: 'Food & Drinks', type: 'EXPENSE' },
  { id: TRANSPORT, nameVi: 'Di chuyển', nameEn: 'Transport', type: 'EXPENSE' },
];

function setup(strategy?: Partial<CategorizerStrategy>) {
  const prisma = mockPrisma(['categoryRule']);
  prisma.$executeRaw = jest.fn();
  const s: CategorizerStrategy = { name: 'fake', suggest: jest.fn(async () => []), ...strategy };
  const categories: any = { visible: jest.fn(async () => visible) };
  return { svc: new CategorizationService(s, prisma, categories), s, prisma, categories };
}

describe('CAT-03 CategorizationService.suggest', () => {
  it('adds names and the pre-select decision (>= 0.6) to the strategy output', async () => {
    const { svc } = setup({ suggest: async () => [{ categoryId: FOOD, confidence: 0.63, reasons: ['global_keyword'] }, { categoryId: TRANSPORT, confidence: 0.2, reasons: ['history'] }] });
    const out = await svc.suggest('u1', { note: 'ca phe' });
    expect(out.suggestions[0]).toEqual({ categoryId: FOOD, confidence: 0.63, nameVi: 'Ăn uống', nameEn: 'Food & Drinks', type: 'EXPENSE', reasons: ['global_keyword'] });
    expect(out.preselectedCategoryId).toBe(FOOD);
  });
  it('does not pre-select below 0.6, and never returns categories the user cannot see', async () => {
    const { svc } = setup({ suggest: async () => [{ categoryId: UID(99), confidence: 0.9, reasons: ['history'] }, { categoryId: FOOD, confidence: 0.5, reasons: ['history'] }] });
    const out = await svc.suggest('u1', { note: 'x' });
    expect(out.suggestions.map((s) => s.categoryId)).toEqual([FOOD]);
    expect(out.preselectedCategoryId).toBeNull();
  });
  it('passes note, amount and type to the strategy together with the user id', async () => {
    const { svc, s } = setup();
    await svc.suggest('u1', { note: 'grab', amount: 45_000, type: 'EXPENSE' });
    expect(s.suggest).toHaveBeenCalledWith({ userId: 'u1', note: 'grab', amount: 45_000, type: 'EXPENSE' });
  });
  it('an ML model can replace the keyword strategy: any CategorizerStrategy works and the response shape is unchanged', async () => {
    const ml: CategorizerStrategy = { name: 'ml-v1', suggest: async () => [{ categoryId: TRANSPORT, confidence: 0.91, reasons: ['history'] }] };
    const out = await setup(ml).svc.suggest('u1', { note: 'anything' });
    expect(Object.keys(out).sort()).toEqual(['preselectedCategoryId', 'suggestions']);
    expect(out.preselectedCategoryId).toBe(TRANSPORT);
  });
  it('top() returns the strategy\'s first suggestion or null', async () => {
    const { svc } = setup({ suggest: async () => [{ categoryId: FOOD, confidence: 0.7, reasons: [] }] });
    expect((await svc.top('u1', 'x'))?.categoryId).toBe(FOOD);
    expect(await setup().svc.top('u1', 'x')).toBeNull();
  });
});

describe('CAT-04 learning from overrides', () => {
  it('overriding the suggestion upserts a personal rule per informative token, bumping hits (one DB transaction)', async () => {
    const { svc, prisma } = setup();
    const n = await svc.learn('u1', { note: 'Cà phê Highlands', categoryId: FOOD, suggestedCategoryId: TRANSPORT });
    expect(n).toBe(3); // ca, phe, highlands
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    const call = prisma.$executeRaw.mock.calls[0];
    expect(call[0].join('?')).toContain('ON CONFLICT (user_id, keyword, category_id)');
    expect(call[0].join('?')).toContain('hits = category_rules.hits + 1');
    expect(call.slice(1)).toEqual(['u1', 'ca', FOOD]); // user id, keyword (diacritic-free), chosen category
    expect(prisma.$executeRaw.mock.calls.map((c: any[]) => c[2])).toEqual(['ca', 'phe', 'highlands']);
  });
  it('contradicting personal rules for the same token lose a hit and are retired at zero', async () => {
    const { svc, prisma } = setup();
    await svc.learn('u1', { note: 'grab', categoryId: FOOD, suggestedCategoryId: TRANSPORT });
    expect(prisma.categoryRule.updateMany).toHaveBeenNthCalledWith(1, { where: { userId: 'u1', keyword: 'grab', deletedAt: null, categoryId: { not: FOOD } }, data: { hits: { decrement: 1 } } });
    expect(prisma.categoryRule.updateMany).toHaveBeenNthCalledWith(2, { where: { userId: 'u1', keyword: 'grab', deletedAt: null, hits: { lte: 0 } }, data: { deletedAt: expect.any(Date) } });
  });
  it('accepting the suggestion teaches nothing', async () => {
    const { svc, prisma } = setup();
    expect(await svc.learn('u1', { note: 'grab', categoryId: FOOD, suggestedCategoryId: FOOD })).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('choosing a category when we had no suggestion is learned', async () => {
    const { svc, prisma } = setup();
    expect(await svc.learn('u1', { note: 'pizza', categoryId: FOOD, suggestedCategoryId: null })).toBe(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('no note, or a note of only stop words/numbers, learns nothing', async () => {
    const { svc, prisma } = setup();
    expect(await svc.learn('u1', { note: null, categoryId: FOOD, suggestedCategoryId: null })).toBe(0);
    expect(await svc.learn('u1', { note: '  ', categoryId: FOOD, suggestedCategoryId: null })).toBe(0);
    expect(await svc.learn('u1', { note: 'di 123 cho', categoryId: FOOD, suggestedCategoryId: null })).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('learns at most 5 tokens per note', async () => {
    const { svc, prisma } = setup();
    expect(await svc.learn('u1', { note: 'mot hai ba bon nam sau bay tam', categoryId: FOOD, suggestedCategoryId: null })).toBe(5);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(5);
  });
  it('a learning failure is swallowed: saving the transaction must never fail because of it', async () => {
    const { svc, prisma } = setup();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await expect(svc.learn('u1', { note: 'grab', categoryId: FOOD, suggestedCategoryId: null })).resolves.toBe(0);
  });
});

import { SuggestCategoryOut } from '@smartwallet/shared';
import { CategorizationService } from '../src/categories/categorization.service';
import { Ctx, Session, createCtx, expectShape, mkTxn, mkWallet, now, signup, systemCategory } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const SUGGEST = '/api/v1/categories/suggest';
const suggest = (u: Session, body: object) => ctx.http().post(SUGGEST).set(u.auth).send(body);
const personalRules = (userId: string) => ctx.prisma.categoryRule.findMany({ where: { userId, deletedAt: null }, orderBy: { keyword: 'asc' } });

describe('POST /categories/suggest (CAT-03)', () => {
  it('200: top suggestions with confidence; the response matches the documented schema', async () => {
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const res = await suggest(s, { note: 'Cà phê Phúc Long', amount: 59_000 }).expect(200);
    expectShape(SuggestCategoryOut, res.body.data);
    const top = res.body.data.suggestions[0];
    expect(top).toMatchObject({ categoryId: food, nameEn: 'Food & Drinks', nameVi: 'Ăn uống', type: 'EXPENSE', reasons: ['global_keyword'] });
    expect(top.confidence).toBeGreaterThanOrEqual(0.6);
    expect(res.body.data.preselectedCategoryId).toBe(food); // >= 0.6 -> the form pre-selects it
  });

  it('diacritics and case do not matter: "GRAB đi học" -> Transport', async () => {
    const transport = await systemCategory(ctx, s, 'EXPENSE', 'Transport');
    expect((await suggest(s, { note: 'GRAB đi học' }).expect(200)).body.data.suggestions[0].categoryId).toBe(transport);
    expect((await suggest(s, { note: 'grab' }).expect(200)).body.data.suggestions[0].categoryId).toBe(transport);
  });

  it('matches whole words only ("be" is not "bên"), and unknown notes give no suggestion and no pre-selection', async () => {
    expect((await suggest(s, { note: 'ngồi bên hồ' }).expect(200)).body.data).toEqual({ suggestions: [], preselectedCategoryId: null });
    expect((await suggest(s, { note: 'xyz qwerty' }).expect(200)).body.data.suggestions).toEqual([]);
    expect((await suggest(s, { note: '' }).expect(200)).body.data.suggestions).toEqual([]);
  });

  it('returns at most 3 suggestions, best first', async () => {
    const res = await suggest(s, { note: 'grab shopee dien highlands' }).expect(200);
    expect(res.body.data.suggestions.length).toBeLessThanOrEqual(3);
    const conf = res.body.data.suggestions.map((x: any) => x.confidence);
    expect(conf).toEqual([...conf].sort((a: number, b: number) => b - a));
    // four categories compete (Transport, Shopping, Bills, Food): the weak top one is NOT pre-selected
    expect(res.body.data.suggestions[0].confidence).toBeLessThan(0.6);
    expect(res.body.data.preselectedCategoryId).toBeNull();
  });

  it('the type filter keeps income and expense apart', async () => {
    const res = await suggest(s, { note: 'grab', type: 'INCOME' }).expect(200);
    expect(res.body.data.suggestions).toEqual([]);
  });

  it('400: missing/over-long note, bad amount or type, unknown keys; 401 anonymous', async () => {
    for (const bad of [{}, { note: 5 }, { note: 'x'.repeat(501) }, { note: 'x', amount: 0 }, { note: 'x', amount: 1.5 }, { note: 'x', type: 'TRANSFER' }, { note: 'x', userId: s.userId }]) {
      expect((await suggest(s, bad).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    }
    await ctx.http().post(SUGGEST).send({ note: 'grab' }).expect(401);
  });
});

describe('CAT-03 history boost (last 90 days of THIS user)', () => {
  const insert = (userId: string, walletId: string, note: string, categoryId: string, daysAgo: number) =>
    ctx.prisma.transaction.create({ data: { userId, walletId, type: 'EXPENSE', amount: 40_000n, note, categoryId, occurredAt: new Date(Date.now() - daysAgo * 86_400_000) } });

  it('suggests the category this user most often picked for the same words, within 90 days only', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const transport = await systemCategory(ctx, s, 'EXPENSE', 'Transport');
    await insert(s.userId, w.id, 'bún bò Huế cô Ba', food, 10);
    await insert(s.userId, w.id, 'bún bò Huế quận 1', food, 20);
    for (let i = 0; i < 4; i++) await insert(s.userId, w.id, 'bún bò Huế', transport, 100 + i); // too old: must be ignored
    const out = (await suggest(s, { note: 'Bún bò Huế' }).expect(200)).body.data;
    expect(out.suggestions[0]).toMatchObject({ categoryId: food, reasons: ['history'] });
    expect(out.suggestions[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(out.suggestions.some((x: any) => x.categoryId === transport)).toBe(false);
    expect(out.preselectedCategoryId).toBe(food);
  });

  it('another user\'s history never leaks into my suggestions', async () => {
    const other = await signup(ctx);
    const w = await mkWallet(ctx, other);
    await insert(other.userId, w.id, 'lẩu thái', await systemCategory(ctx, other, 'EXPENSE', 'Food & Drinks'), 5);
    expect((await suggest(s, { note: 'lẩu thái' }).expect(200)).body.data.suggestions).toEqual([]);
  });
});

describe('CAT-04 learning from overrides', () => {
  it('overriding the suggestion creates personal rules for the note\'s words; the next suggestion follows them', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const shopping = await systemCategory(ctx, s, 'EXPENSE', 'Shopping');
    expect((await suggest(s, { note: 'Highlands' }).expect(200)).body.data.suggestions[0].categoryId).toBe(food); // global rule

    await mkTxn(ctx, s, w.id, { note: 'Highlands mua sách', categoryId: shopping }); // the user disagrees
    const rules = await personalRules(s.userId);
    expect(rules.map((r) => r.keyword)).toEqual(['highlands', 'mua', 'sach']);
    expect(rules.every((r) => r.categoryId === shopping && r.hits === 1 && r.weight === 1)).toBe(true);

    const after = (await suggest(s, { note: 'Highlands' }).expect(200)).body.data;
    expect(after.suggestions[0]).toMatchObject({ categoryId: shopping });
    expect(after.suggestions[0].reasons).toContain('personal_rule');
    expect(after.suggestions[1].categoryId).toBe(food); // the global rule is still there, just outranked (x3 vs x1)
  });

  it('accepting the suggestion teaches nothing', async () => {
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, { note: 'Grab đi học', categoryId: await systemCategory(ctx, s, 'EXPENSE', 'Transport') });
    expect(await personalRules(s.userId)).toEqual([]);
  });

  it('personal rules are per user', async () => {
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, { note: 'Highlands', categoryId: await systemCategory(ctx, s, 'EXPENSE', 'Shopping') });
    const other = await signup(ctx);
    expect((await suggest(other, { note: 'Highlands' }).expect(200)).body.data.suggestions[0].nameEn).toBe('Food & Drinks');
  });

  it('a contradicting override retires the old personal rule (hits fall to zero) and the new choice wins', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const shopping = await systemCategory(ctx, s, 'EXPENSE', 'Shopping');
    const bills = await systemCategory(ctx, s, 'EXPENSE', 'Bills');
    await mkTxn(ctx, s, w.id, { note: 'zumba', categoryId: shopping }); // no suggestion -> learned
    expect((await personalRules(s.userId)).find((r) => r.keyword === 'zumba')).toMatchObject({ categoryId: shopping, hits: 1 });
    await mkTxn(ctx, s, w.id, { note: 'zumba', categoryId: bills }); // now suggested = shopping -> override
    const zumba = (await personalRules(s.userId)).filter((r) => r.keyword === 'zumba');
    expect(zumba).toHaveLength(1); // the shopping rule dropped to 0 hits and was retired
    expect(zumba[0]).toMatchObject({ categoryId: bills, hits: 1 });
    expect((await suggest(s, { note: 'zumba' }).expect(200)).body.data.suggestions[0].categoryId).toBe(bills);
    void food;
  });

  it('upserting the same rule again adds a hit (race-free ON CONFLICT upsert)', async () => {
    const shopping = await systemCategory(ctx, s, 'EXPENSE', 'Shopping');
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const svc = ctx.app.get(CategorizationService);
    await svc.learn(s.userId, { note: 'xyzzy', categoryId: shopping, suggestedCategoryId: food });
    await Promise.all([1, 2, 3].map(() => svc.learn(s.userId, { note: 'xyzzy', categoryId: shopping, suggestedCategoryId: food })));
    const rows = (await personalRules(s.userId)).filter((r) => r.keyword === 'xyzzy');
    expect(rows).toHaveLength(1); // the partial unique index: never duplicates, even concurrently
    expect(rows[0].hits).toBe(4);
  });

  it('editing a transaction\'s category is an override too', async () => {
    const w = await mkWallet(ctx, s);
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const health = await systemCategory(ctx, s, 'EXPENSE', 'Health');
    const t = await mkTxn(ctx, s, w.id, { note: 'phòng khám', categoryId: food });
    await ctx.http().patch(`/api/v1/transactions/${t.id}`).set(s.auth).send({ categoryId: health }).expect(200);
    const rules = await personalRules(s.userId);
    expect(rules.filter((r) => r.categoryId === health).map((r) => r.keyword).sort()).toEqual(['kham', 'phong']);
  });

  it('a transaction without a note or category never touches the rules', async () => {
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, {});
    await mkTxn(ctx, s, w.id, { note: 'no category here' });
    expect(await personalRules(s.userId)).toEqual([]);
  });

  it('the learned rules survive in the database and can be audited', async () => {
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, { note: 'Netflix', categoryId: await systemCategory(ctx, s, 'EXPENSE', 'Entertainment'), occurredAt: now() });
    expect((await ctx.prisma.categoryRule.findFirstOrThrow({ where: { userId: s.userId, keyword: 'netflix' } })).hits).toBe(1);
  });
});

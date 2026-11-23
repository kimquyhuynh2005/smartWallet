import { CategoryOut } from '@smartwallet/shared';
import { Ctx, Session, createCtx, expectShape, mkTxn, mkWallet, now, signup, systemCategory } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); });

const C = '/api/v1/categories';
const mk = (u: Session, body: object) => ctx.http().post(C).set(u.auth).send({ nameVi: 'Cà phê sáng', nameEn: 'Morning coffee', type: 'EXPENSE', ...body });

describe('GET /categories (CAT-01)', () => {
  it('lists the 15 seeded system defaults in Vietnamese and English, with icon and colour', async () => {
    const res = await ctx.http().get(C).set(s.auth).expect(200);
    res.body.data.forEach((c: unknown) => expectShape(CategoryOut, c));
    const sys = res.body.data.filter((c: any) => c.isSystem);
    expect(sys.length).toBeGreaterThanOrEqual(15);
    expect(sys.find((c: any) => c.nameEn === 'Food & Drinks')).toMatchObject({ nameVi: 'Ăn uống', type: 'EXPENSE', icon: 'utensils' });
    expect(sys.find((c: any) => c.nameEn === 'Salary')).toMatchObject({ nameVi: 'Lương', type: 'INCOME' });
    for (const n of ['Transport', 'Housing', 'Bills', 'Shopping', 'Entertainment', 'Education', 'Health', 'Gifts', 'Allowance', 'Part-time', 'Bonus', 'Other']) {
      expect(sys.some((c: any) => c.nameEn === n)).toBe(true);
    }
    expect(sys.every((c: any) => c.icon && c.color)).toBe(true);
  });
  it('shows my custom categories to me only; ?type filters; bad type is 400; 401 anonymous', async () => {
    const mine = (await mk(s, {}).expect(201)).body.data;
    expect((await ctx.http().get(C).set(s.auth)).body.data.some((c: any) => c.id === mine.id)).toBe(true);
    expect((await ctx.http().get(C).set((await signup(ctx)).auth)).body.data.some((c: any) => c.id === mine.id)).toBe(false);
    const inc = (await ctx.http().get(`${C}?type=INCOME`).set(s.auth)).body.data;
    expect(inc.length).toBeGreaterThan(0);
    expect(inc.every((c: any) => c.type === 'INCOME')).toBe(true);
    await ctx.http().get(`${C}?type=GIFT`).set(s.auth).expect(400);
    await ctx.http().get(C).expect(401);
  });
});

describe('POST /categories (CAT-02)', () => {
  it('201: creates a custom root category owned by me', async () => {
    const res = await mk(s, { icon: 'coffee', color: '#8B5E3C' }).expect(201);
    expectShape(CategoryOut, res.body.data);
    expect(res.body.data).toMatchObject({ isSystem: false, parentId: null, nameEn: 'Morning coffee', icon: 'coffee', color: '#8B5E3C', type: 'EXPENSE' });
  });
  it('201: a sub-category under a system root or my own root (2 levels)', async () => {
    const food = await systemCategory(ctx, s, 'EXPENSE', 'Food & Drinks');
    const sub = (await mk(s, { parentId: food }).expect(201)).body.data;
    expect(sub.parentId).toBe(food);
    const root = (await mk(s, {}).expect(201)).body.data;
    await mk(s, { parentId: root.id }).expect(201);
  });
  it('422 CATEGORY_DEPTH_EXCEEDED for a 3rd level; 422 CATEGORY_TYPE_MISMATCH against the parent', async () => {
    const root = (await mk(s, {}).expect(201)).body.data;
    const child = (await mk(s, { parentId: root.id }).expect(201)).body.data;
    expect((await mk(s, { parentId: child.id }).expect(422)).body.error.code).toBe('CATEGORY_DEPTH_EXCEEDED');
    expect((await mk(s, { parentId: root.id, type: 'INCOME' }).expect(422)).body.error.code).toBe('CATEGORY_TYPE_MISMATCH');
  });
  it('404 for a parent that is another user\'s or does not exist', async () => {
    const theirs = (await mk(await signup(ctx), {}).expect(201)).body.data;
    await mk(s, { parentId: theirs.id }).expect(404);
    await mk(s, { parentId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });
  it('400: missing names, bad type/colour, user_id, unknown keys; 401 anonymous', async () => {
    for (const bad of [{ nameVi: '' }, { nameEn: undefined }, { type: 'TRANSFER' }, { color: 'red' }, { userId: s.userId }, { parentId: 'x' }, { isSystem: true }]) {
      expect((await mk(s, bad).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    }
    await ctx.http().post(C).send({}).expect(401);
  });
  it('a custom category can be used on a matching transaction', async () => {
    const w = await mkWallet(ctx, s);
    const c = (await mk(s, {}).expect(201)).body.data;
    await mkTxn(ctx, s, w.id, { categoryId: c.id });
    await ctx.http().post('/api/v1/transactions').set((await signup(ctx)).auth).send({ walletId: w.id, categoryId: c.id, type: 'EXPENSE', amount: 1, occurredAt: now() }).expect(404);
  });
});

describe('PATCH /categories/:id (CAT-02)', () => {
  it('200: renames, recolours, nests and un-nests my category', async () => {
    const a = (await mk(s, {}).expect(201)).body.data;
    const b = (await mk(s, { nameEn: 'B' }).expect(201)).body.data;
    const res = await ctx.http().patch(`${C}/${a.id}`).set(s.auth).send({ nameVi: 'Mới', nameEn: 'New', icon: 'x', color: '#123456', parentId: b.id }).expect(200);
    expectShape(CategoryOut, res.body.data);
    expect(res.body.data).toMatchObject({ nameEn: 'New', nameVi: 'Mới', parentId: b.id, color: '#123456' });
    expect((await ctx.http().patch(`${C}/${a.id}`).set(s.auth).send({ parentId: null, icon: null }).expect(200)).body.data).toMatchObject({ parentId: null, icon: null });
  });
  it('422 when nesting would make 3 levels (parent is a child, itself, or the category already has children)', async () => {
    const root = (await mk(s, {}).expect(201)).body.data;
    const child = (await mk(s, { parentId: root.id }).expect(201)).body.data;
    const other = (await mk(s, { nameEn: 'O' }).expect(201)).body.data;
    for (const [id, parentId] of [[other.id, child.id], [other.id, other.id], [root.id, other.id]]) {
      expect((await ctx.http().patch(`${C}/${id}`).set(s.auth).send({ parentId }).expect(422)).body.error.code).toBe('CATEGORY_DEPTH_EXCEEDED');
    }
  });
  it('403 SYSTEM_CATEGORY_READONLY for default categories; 404 for other users\' and malformed ids; 400 invalid; 401 anonymous', async () => {
    const sys = await systemCategory(ctx, s, 'EXPENSE', 'Transport');
    expect((await ctx.http().patch(`${C}/${sys}`).set(s.auth).send({ nameEn: 'hacked' }).expect(403)).body.error.code).toBe('SYSTEM_CATEGORY_READONLY');
    const mine = (await mk(s, {}).expect(201)).body.data;
    await ctx.http().patch(`${C}/${mine.id}`).set((await signup(ctx)).auth).send({ nameEn: 'x' }).expect(404);
    await ctx.http().patch(`${C}/nope`).set(s.auth).send({ nameEn: 'x' }).expect(404);
    for (const bad of [{}, { type: 'INCOME' }, { userId: 'x' }, { color: 'blue' }]) await ctx.http().patch(`${C}/${mine.id}`).set(s.auth).send(bad).expect(400);
    await ctx.http().patch(`${C}/${mine.id}`).send({ nameEn: 'x' }).expect(401);
  });
});

describe('DELETE /categories/:id (CAT-02)', () => {
  it('204: removes the category, its sub-categories and their budgets; past transactions keep working', async () => {
    const w = await mkWallet(ctx, s);
    const root = (await mk(s, {}).expect(201)).body.data;
    const child = (await mk(s, { parentId: root.id }).expect(201)).body.data;
    const t = await mkTxn(ctx, s, w.id, { categoryId: root.id });
    await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId: root.id, limitAmount: 1000 }).expect(201);
    expect((await ctx.http().get('/api/v1/budgets').set(s.auth)).body.data).toHaveLength(1);

    await ctx.http().delete(`${C}/${root.id}`).set(s.auth).expect(204);
    const ids = (await ctx.http().get(C).set(s.auth)).body.data.map((c: any) => c.id);
    expect(ids).not.toContain(root.id);
    expect(ids).not.toContain(child.id);
    expect((await ctx.http().get('/api/v1/budgets').set(s.auth)).body.data).toHaveLength(0);
    expect((await ctx.http().get(`/api/v1/transactions/${t.id}`).set(s.auth)).body.data.categoryId).toBe(root.id); // history is intact
    await ctx.http().post('/api/v1/transactions').set(s.auth).send({ walletId: w.id, categoryId: root.id, type: 'EXPENSE', amount: 1, occurredAt: now() }).expect(404); // but cannot be used again
    await ctx.http().delete(`${C}/${root.id}`).set(s.auth).expect(404);
  });
  it('403 for system defaults (they survive); 404 for others\' / malformed; 401 anonymous', async () => {
    const sys = await systemCategory(ctx, s, 'EXPENSE', 'Health');
    expect((await ctx.http().delete(`${C}/${sys}`).set(s.auth).expect(403)).body.error.code).toBe('SYSTEM_CATEGORY_READONLY');
    expect((await ctx.http().get(C).set(s.auth)).body.data.some((c: any) => c.id === sys)).toBe(true);
    const mine = (await mk(s, {}).expect(201)).body.data;
    await ctx.http().delete(`${C}/${mine.id}`).set((await signup(ctx)).auth).expect(404);
    await ctx.http().delete(`${C}/nope`).set(s.auth).expect(404);
    await ctx.http().delete(`${C}/${mine.id}`).expect(401);
  });
});

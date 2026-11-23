import { ImportConfirmOut, ImportPreviewOut } from '@smartwallet/shared';
import { Ctx, Session, balanceOf, captureEvents, createCtx, expectShape, mkTxn, mkWallet, premium, signup } from './helpers';

let ctx: Ctx;
let s: Session;
beforeAll(async () => { ctx = await createCtx(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { s = await signup(ctx); await premium(ctx, s); });

const IMPORT = '/api/v1/transactions/import';
const CSV = [
  'Ngày,Số tiền,Nội dung,Loại,Danh mục',
  '05/11/2026,"50.000",Phở bò,Chi,Ăn uống',
  '06/11/2026,-30000,Grab đi học,,',
  '07/11/2026,12.000.000,Lương tháng 11,Thu,Lương',
  '31/02/2026,1000,ngày sai,Chi,',
  '08/11/2026,abc,số tiền sai,Chi,',
  "09/11/2026,10000,=cmd|' /C calc'!A0,Chi,",
].join('\n');

const upload = (u: Session, walletId: string | undefined, text: string | Buffer, name = 'statement.csv', type = 'text/csv') => {
  let r = ctx.http().post(IMPORT).set(u.auth);
  if (walletId) r = r.field('walletId', walletId);
  return r.attach('file', Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8'), { filename: name, contentType: type });
};
const confirm = (u: Session, id: string, body: object = {}) => ctx.http().post(`${IMPORT}/${id}/confirm`).set(u.auth).send(body);

describe('plan gating (TXN-06 is Premium)', () => {
  it('Free users get 403 PLAN_LIMIT_REACHED on both calls, before any file is processed', async () => {
    const free = await signup(ctx);
    const w = await mkWallet(ctx, free);
    const res = await upload(free, w.id, CSV).expect(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { feature: 'csv_import' } });
    await confirm(free, '00000000-0000-4000-8000-000000000000').expect(403);
  });
  it('401 without a token', async () => {
    await ctx.http().post(IMPORT).expect(401);
    await ctx.http().post(`${IMPORT}/x/confirm`).send({}).expect(401);
  });
});

describe('POST /transactions/import: preview', () => {
  it('200: parses rows, flags errors and suggests categories; nothing is written yet', async () => {
    const w = await mkWallet(ctx, s);
    const res = await upload(s, w.id, CSV).expect(200);
    expectShape(ImportPreviewOut, res.body.data);
    const rows = res.body.data.rows as any[];
    expect(res.body.data.summary).toEqual({ total: 6, valid: 4, duplicates: 0, errors: 2 });
    expect(rows[0]).toMatchObject({ line: 2, amount: 50_000, type: 'EXPENSE', duplicate: false, date: '2026-11-05T05:00:00.000Z' });
    expect(rows[0].categoryId).toBeTruthy(); // matched by Vietnamese name "Ăn uống"
    expect(rows[1]).toMatchObject({ line: 3, amount: 30_000, type: 'EXPENSE' }); // negative amount => expense
    expect(rows[1].categoryId).toBeTruthy(); // auto-categorised from "Grab"
    expect(rows[2]).toMatchObject({ amount: 12_000_000, type: 'INCOME' });
    expect(rows[3].errors).toContain('invalid date');
    expect(rows[4].errors).toContain('invalid amount');
    expect((await ctx.http().get('/api/v1/transactions').set(s.auth)).body.meta.total).toBe(0);
    expect(await balanceOf(ctx, s, w.id)).toBe(0);
  });

  it('works with English headers, semicolons and ISO dates', async () => {
    const w = await mkWallet(ctx, s);
    const res = await upload(s, w.id, 'date;amount;description\n2026-11-05;1.500.000;Salary bonus\n2026-11-06;-25000;Coffee').expect(200);
    expect(res.body.data.rows.map((r: any) => [r.amount, r.type])).toEqual([[1_500_000, 'INCOME'], [25_000, 'EXPENSE']]);
  });

  it('formula injection: dangerous cells are stored as inert text', async () => {
    const w = await mkWallet(ctx, s);
    const prev = (await upload(s, w.id, CSV).expect(200)).body.data;
    expect(prev.rows[5].note).toBe("'=cmd|' /C calc'!A0");
    await confirm(s, prev.importId).expect(200);
    const stored = await ctx.prisma.transaction.findMany({ where: { userId: s.userId, note: { startsWith: "'=" } } });
    expect(stored).toHaveLength(1);
  });

  it('re-uploading the same file flags every row as a duplicate', async () => {
    const w = await mkWallet(ctx, s);
    const first = (await upload(s, w.id, CSV).expect(200)).body.data;
    await confirm(s, first.importId).expect(200);
    const second = (await upload(s, w.id, CSV).expect(200)).body.data;
    expect(second.summary).toMatchObject({ valid: 4, duplicates: 4 });
    expect(second.rows.filter((r: any) => r.duplicate)).toHaveLength(4);
  });

  it('duplicate detection matches an existing manual transaction (same day, amount, type, note) regardless of case/diacritics', async () => {
    const w = await mkWallet(ctx, s);
    await mkTxn(ctx, s, w.id, { amount: 50_000, note: 'PHO BO', occurredAt: '2026-11-05T09:30:00.000Z' });
    const prev = (await upload(s, w.id, CSV).expect(200)).body.data;
    expect(prev.rows[0].duplicate).toBe(true);
    expect(prev.rows[1].duplicate).toBe(false);
  });

  it('400 without walletId / with unknown fields, 404 foreign wallet, 409 archived wallet', async () => {
    const w = await mkWallet(ctx, s);
    await upload(s, undefined, CSV).expect(400);
    await ctx.http().post(IMPORT).set(s.auth).field('walletId', w.id).field('hack', '1').attach('file', Buffer.from(CSV), { filename: 'a.csv', contentType: 'text/csv' }).expect(400);
    const foreign = await mkWallet(ctx, await signup(ctx));
    await upload(s, foreign.id, CSV).expect(404);
    await ctx.http().patch(`/api/v1/wallets/${w.id}`).set(s.auth).send({ isArchived: true }).expect(200);
    await upload(s, w.id, CSV).expect(409);
  });

  it('415 when no file or a non-CSV file is sent; 422 for unusable CSVs; 413 above 2 MB', async () => {
    const w = await mkWallet(ctx, s);
    expect((await ctx.http().post(IMPORT).set(s.auth).field('walletId', w.id).expect(415)).body.error.code).toBe('FILE_REQUIRED');
    expect((await upload(s, w.id, CSV, 'statement.txt', 'text/plain').expect(415)).body.error.code).toBe('INVALID_FILE_TYPE');
    expect((await upload(s, w.id, CSV, 'statement.csv', 'image/png').expect(415)).body.error.code).toBe('INVALID_FILE_TYPE');
    expect((await upload(s, w.id, 'foo,bar\n1,2').expect(422)).body.error.code).toBe('CSV_MISSING_COLUMNS');
    expect((await upload(s, w.id, 'date,amount').expect(422)).body.error.code).toBe('INVALID_CSV');
    expect((await upload(s, w.id, Buffer.from('date,amount\n01/01/2026,1\u0000\u0000')).expect(422)).body.error.code).toBe('INVALID_CSV');
    const tooMany = 'date,amount\n' + Array.from({ length: 5001 }, () => '01/01/2026,1000').join('\n');
    expect((await upload(s, w.id, tooMany).expect(422)).body.error.code).toBe('CSV_TOO_MANY_ROWS');
    await upload(s, w.id, Buffer.alloc(2 * 1024 * 1024 + 10, 'a')).expect(413);
  });
});

describe('POST /transactions/import/:importId/confirm', () => {
  it('200: saves non-duplicate valid rows in one transaction as source IMPORT, updates the balance and publishes "imported"', async () => {
    const events = captureEvents(ctx);
    const w = await mkWallet(ctx, s);
    const prev = (await upload(s, w.id, CSV).expect(200)).body.data;
    const res = await confirm(s, prev.importId).expect(200);
    expectShape(ImportConfirmOut, res.body.data);
    expect(res.body.data).toMatchObject({ imported: 4, skipped: 0 });
    expect(await ctx.prisma.transaction.count({ where: { userId: s.userId, source: 'IMPORT' } })).toBe(4);
    expect(await balanceOf(ctx, s, w.id)).toBe(12_000_000 - 50_000 - 30_000 - 10_000);
    const ev = events.find((e) => e.action === 'imported');
    expect(ev.current).toHaveLength(4);
    expect(ev.previous).toEqual([]);
  });
  it('skips duplicates by default; includeDuplicates and excludeLines override', async () => {
    const w = await mkWallet(ctx, s);
    await confirm(s, (await upload(s, w.id, CSV).expect(200)).body.data.importId).expect(200);
    const again = (await upload(s, w.id, CSV).expect(200)).body.data;
    const res = await confirm(s, again.importId).expect(200);
    expect(res.body.data).toMatchObject({ imported: 0, skipped: 4 });
    const third = (await upload(s, w.id, CSV).expect(200)).body.data;
    expect((await confirm(s, third.importId, { includeDuplicates: true, excludeLines: [2, 3] }).expect(200)).body.data.imported).toBe(2);
  });
  it('a preview is single-use and expires: second confirm 404 IMPORT_NOT_FOUND', async () => {
    const w = await mkWallet(ctx, s);
    const prev = (await upload(s, w.id, CSV).expect(200)).body.data;
    await confirm(s, prev.importId).expect(200);
    expect((await confirm(s, prev.importId).expect(404)).body.error.code).toBe('IMPORT_NOT_FOUND');
    const p2 = (await upload(s, w.id, CSV).expect(200)).body.data;
    await ctx.redis.client.del(`import:${s.userId}:${p2.importId}`);
    await confirm(s, p2.importId).expect(404);
  });
  it('another user cannot confirm my preview (404) and my preview stays valid', async () => {
    const w = await mkWallet(ctx, s);
    const prev = (await upload(s, w.id, CSV).expect(200)).body.data;
    const other = await signup(ctx);
    await premium(ctx, other);
    await confirm(other, prev.importId).expect(404);
    await confirm(s, prev.importId).expect(200);
  });
  it('400 for bad bodies; 409 if the wallet got archived meanwhile (preview kept)', async () => {
    const w = await mkWallet(ctx, s);
    const prev = (await upload(s, w.id, CSV).expect(200)).body.data;
    await confirm(s, prev.importId, { includeDuplicates: 'yes' }).expect(400);
    await confirm(s, prev.importId, { foo: 1 }).expect(400);
    await ctx.http().patch(`/api/v1/wallets/${w.id}`).set(s.auth).send({ isArchived: true }).expect(200);
    await confirm(s, prev.importId).expect(409);
    await ctx.http().patch(`/api/v1/wallets/${w.id}`).set(s.auth).send({ isArchived: false }).expect(200);
    await confirm(s, prev.importId).expect(200); // the failed attempt did not consume the preview
  });
  it('imported expenses trigger budget alerts through the transaction.changed event', async () => {
    const w = await mkWallet(ctx, s);
    await ctx.http().post('/api/v1/budgets').set(s.auth).send({ categoryId: null, limitAmount: 100_000 }).expect(201);
    const d = new Date(Date.now() + 7 * 3_600_000); // today in Vietnam, so the rows fall inside the current budget period
    const today = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    const csv = `date,amount,note
${today},-90000,Ăn trưa
${today},-60000,Cà phê`;
    await confirm(s, (await upload(s, w.id, csv).expect(200)).body.data.importId).expect(200);
    const n = (await ctx.http().get('/api/v1/notifications').set(s.auth)).body.data;
    expect(n.map((x: any) => x.type).sort()).toEqual(['BUDGET_EXCEEDED', 'BUDGET_WARNING']);
  });
});

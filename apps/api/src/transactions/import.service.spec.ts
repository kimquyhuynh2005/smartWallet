import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FakeRedis, UID, mockPrisma, user } from '../testing/mocks';
import { ImportService } from './import.service';

const CATS = [
  { id: UID(20), nameEn: 'Food & Drinks', nameVi: 'Ăn uống', type: 'EXPENSE' },
  { id: UID(21), nameEn: 'Salary', nameVi: 'Lương', type: 'INCOME' },
  { id: UID(22), nameEn: 'Transport', nameVi: 'Di chuyển', type: 'EXPENSE' },
];
const CSV = [
  'Ngày,Số tiền,Nội dung,Loại,Danh mục',
  '05/11/2026,"50.000",Phở bò,Chi,Ăn uống',
  '06/11/2026,-30000,Grab đi học,,',
  '07/11/2026,12.000.000,Lương,Thu,Lương',
  '31/02/2026,1000,bad date,Chi,',
  "08/11/2026,abc,bad amount,Chi,",
  "09/11/2026,10000,=cmd|' /C calc'!A0,Chi,",
].join('\n');
const file = (text: string) => ({ buffer: Buffer.from(text, 'utf8'), originalname: 'x.csv', mimetype: 'text/csv' });

function setup() {
  const prisma = mockPrisma(['transaction']);
  prisma.transaction.createManyAndReturn.mockImplementation(async ({ data }: any) => data.map((d: any, i: number) => ({ id: UID(500 + i), transferWalletId: null, ...d })));
  const repo: any = { inWindow: jest.fn(async () => []) };
  const wallets: any = { getUsable: jest.fn(async () => ({})), invalidate: jest.fn() };
  const categories: any = { visible: jest.fn(async () => CATS), loadRules: jest.fn(async () => [{ keyword: 'grab', categoryId: UID(22), weight: 1, isUser: false }]) };
  const redis = new FakeRedis();
  const events: any = { publish: jest.fn() };
  return { svc: new ImportService(prisma, repo, wallets, categories, redis as any, events), prisma, repo, wallets, categories, redis, events };
}

describe('TXN-06 preview', () => {
  it('parses Vietnamese dates/amounts, infers type from sign, suggests categories and reports per-row errors', async () => {
    const { svc } = setup();
    const p = await svc.preview(user, UID(1), file(CSV));
    const by = (line: number) => p.rows.find((r) => r.line === line)!;
    expect(by(2)).toMatchObject({ amount: 50_000, type: 'EXPENSE', categoryId: UID(20), errors: [] });
    expect(by(2).date!.toISOString()).toBe('2026-11-05T05:00:00.000Z');
    expect(by(3)).toMatchObject({ amount: 30_000, type: 'EXPENSE', categoryId: UID(22), errors: [] }); // sign + CAT-03 rule "grab"
    expect(by(4)).toMatchObject({ amount: 12_000_000, type: 'INCOME', categoryId: UID(21) });
    expect(by(5).errors).toContain('invalid date');
    expect(by(6).errors).toContain('invalid amount');
    expect(p.summary).toEqual({ total: 6, valid: 4, duplicates: 0, errors: 2 });
  });

  it('neutralises formula injection in the note', async () => {
    const { svc } = setup();
    const p = await svc.preview(user, UID(1), file(CSV));
    expect(p.rows.find((r) => r.line === 7)!.note).toBe("'=cmd|' /C calc'!A0");
  });

  it('flags rows that already exist (same wallet, type, amount, Vietnam day and note) as duplicates', async () => {
    const { svc, repo } = setup();
    repo.inWindow.mockResolvedValue([{ type: 'EXPENSE', amount: 50_000n, occurredAt: new Date('2026-11-05T03:00:00Z'), note: 'PHỞ BÒ' }]);
    const p = await svc.preview(user, UID(1), file(CSV));
    expect(p.rows.find((r) => r.line === 2)!.duplicate).toBe(true);
    expect(p.rows.find((r) => r.line === 3)!.duplicate).toBe(false);
    expect(p.summary.duplicates).toBe(1);
  });

  it('writes nothing to the database; the preview lives in Redis for 30 min under a user-scoped key', async () => {
    const { svc, prisma, redis } = setup();
    const p = await svc.preview(user, UID(1), file(CSV));
    expect(prisma.transaction.createManyAndReturn).not.toHaveBeenCalled();
    expect(redis.store.has(`import:u1:${p.importId}`)).toBe(true);
    expect(redis.ttl.get(`import:u1:${p.importId}`)).toBe(1800);
  });

  it('validates the wallet first and the file shape', async () => {
    const { svc, wallets } = setup();
    wallets.getUsable.mockRejectedValue(new NotFoundException());
    await expect(svc.preview(user, UID(1), file(CSV))).rejects.toBeInstanceOf(NotFoundException);
    wallets.getUsable.mockResolvedValue({});
    await expect(svc.preview(user, UID(1), file('date,amount'))).rejects.toMatchObject({ response: { code: 'INVALID_CSV' } });
    await expect(svc.preview(user, UID(1), file('foo,bar\n1,2'))).rejects.toMatchObject({ response: { code: 'CSV_MISSING_COLUMNS' } });
    await expect(svc.preview(user, UID(1), file('date,amount\n1/1/2026,1\u0000'))).rejects.toBeInstanceOf(UnprocessableEntityException);
    const big = 'date,amount\n' + Array.from({ length: 5001 }, () => '01/01/2026,1000').join('\n');
    await expect(svc.preview(user, UID(1), file(big))).rejects.toMatchObject({ response: { code: 'CSV_TOO_MANY_ROWS' } });
  });
});

describe('TXN-06 confirm', () => {
  it('imports valid non-duplicate rows in ONE db transaction, marks source IMPORT, invalidates cache and publishes "imported"', async () => {
    const { svc, repo, prisma, wallets, events } = setup();
    repo.inWindow.mockResolvedValue([{ type: 'EXPENSE', amount: 50_000n, occurredAt: new Date('2026-11-05T05:00:00Z'), note: 'phở bò' }]);
    const p = await svc.preview(user, UID(1), file(CSV));
    const out = await svc.confirm(user, p.importId, { includeDuplicates: false, excludeLines: [] });
    expect(out.imported).toBe(3); // 4 valid - 1 duplicate
    expect(out.skipped).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const rows = prisma.transaction.createManyAndReturn.mock.calls[0][0].data;
    expect(rows.every((r: any) => r.source === 'IMPORT' && r.userId === 'u1' && r.walletId === UID(1))).toBe(true);
    expect(rows.map((r: any) => r.amount)).toEqual([30_000n, 12_000_000n, 10_000n]);
    expect(wallets.invalidate).toHaveBeenCalledWith(UID(1));
    expect(events.publish).toHaveBeenCalledWith('transaction.changed', expect.objectContaining({ action: 'imported', previous: [], current: expect.any(Array) }));
  });

  it('includeDuplicates and excludeLines are honoured', async () => {
    const { svc, repo } = setup();
    repo.inWindow.mockResolvedValue([{ type: 'EXPENSE', amount: 50_000n, occurredAt: new Date('2026-11-05T05:00:00Z'), note: 'Phở bò' }]);
    const p = await svc.preview(user, UID(1), file(CSV));
    const out = await svc.confirm(user, p.importId, { includeDuplicates: true, excludeLines: [4] });
    expect(out.imported).toBe(3);
  });

  it('a preview can be confirmed only once (double submit is 404)', async () => {
    const { svc } = setup();
    const p = await svc.preview(user, UID(1), file(CSV));
    await svc.confirm(user, p.importId, { includeDuplicates: false, excludeLines: [] });
    await expect(svc.confirm(user, p.importId, { includeDuplicates: false, excludeLines: [] })).rejects.toMatchObject({ response: { code: 'IMPORT_NOT_FOUND' } });
  });

  it('another user cannot confirm my preview (keys are scoped by user id)', async () => {
    const { svc } = setup();
    const p = await svc.preview(user, UID(1), file(CSV));
    await expect(svc.confirm({ id: 'u2', role: 'USER' }, p.importId, { includeDuplicates: false, excludeLines: [] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('drops a category deleted between preview and confirm instead of failing', async () => {
    const { svc, categories, prisma } = setup();
    const p = await svc.preview(user, UID(1), file(CSV));
    categories.visible.mockResolvedValue(CATS.filter((c) => c.id !== UID(20)));
    await svc.confirm(user, p.importId, { includeDuplicates: false, excludeLines: [] });
    expect(prisma.transaction.createManyAndReturn.mock.calls[0][0].data[0].categoryId).toBeNull();
  });
});

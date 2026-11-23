import { suggestCategory } from './categories.service';

const r = (keyword: string, categoryId: string, extra: Partial<{ weight: number; isUser: boolean }> = {}) => ({ keyword, categoryId, weight: 1, isUser: false, ...extra });

describe('CAT-03 auto-suggest', () => {
  const rules = [r('grab', 'transport'), r('be', 'transport'), r('ca phe', 'food'), r('highlands', 'food')];
  it('matches Vietnamese notes regardless of diacritics and case', () => {
    expect(suggestCategory('Cà phê Highlands', rules)).toBe('food');
    expect(suggestCategory('Đi GRAB về nhà', rules)).toBe('transport');
  });
  it('matches whole words only ("be" must not match "bên")', () => {
    expect(suggestCategory('ngồi bên hồ', rules)).toBeNull();
    expect(suggestCategory('Be đi học', rules)).toBe('transport');
  });
  it('user rules beat global rules', () => {
    expect(suggestCategory('grab food', [...rules, r('grab', 'mine', { isUser: true })])).toBe('mine');
  });
  it('returns null when nothing matches', () => {
    expect(suggestCategory('misc', rules)).toBeNull();
  });
});

import { CategoriesService } from './categories.service';
import { UID, mockPrisma } from '../testing/mocks';

describe('CAT-02 CategoriesService', () => {
  const cat = (over: Record<string, unknown> = {}) => ({ id: UID(1), userId: 'u1', parentId: null, nameVi: 'A', nameEn: 'A', type: 'EXPENSE', icon: null, color: null, deletedAt: null, ...over });
  function setup() {
    const prisma = mockPrisma(['category', 'budget', 'categoryRule']);
    return { svc: new CategoriesService(prisma), prisma };
  }

  it('present() flags system defaults and hides user_id', () => {
    const { svc } = setup();
    expect(svc.present(cat({ userId: null }) as any)).toMatchObject({ isSystem: true });
    expect(svc.present(cat() as any)).not.toHaveProperty('userId');
  });

  it('allows a sub-category under a root, and records the owner', async () => {
    const { svc, prisma } = setup();
    prisma.category.findFirst.mockResolvedValue(cat({ id: UID(9), userId: null })); // system root parent
    prisma.category.create.mockImplementation(async ({ data }: any) => cat(data));
    await svc.create('u1', { nameVi: 'x', nameEn: 'x', type: 'EXPENSE', parentId: UID(9) });
    expect(prisma.category.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', parentId: UID(9) });
  });

  it('refuses a third level (CATEGORY_DEPTH_EXCEEDED) and a type mismatch with the parent', async () => {
    const { svc, prisma } = setup();
    prisma.category.findFirst.mockResolvedValue(cat({ id: UID(9), parentId: UID(8) })); // parent is already a child
    await expect(svc.create('u1', { nameVi: 'x', nameEn: 'x', type: 'EXPENSE', parentId: UID(9) })).rejects.toMatchObject({ response: { code: 'CATEGORY_DEPTH_EXCEEDED' } });
    prisma.category.findFirst.mockResolvedValue(cat({ id: UID(9), type: 'INCOME' }));
    await expect(svc.create('u1', { nameVi: 'x', nameEn: 'x', type: 'EXPENSE', parentId: UID(9) })).rejects.toMatchObject({ response: { code: 'CATEGORY_TYPE_MISMATCH' } });
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('system defaults cannot be edited or deleted (403 SYSTEM_CATEGORY_READONLY)', async () => {
    const { svc, prisma } = setup();
    prisma.category.findFirst.mockResolvedValue(cat({ userId: null }));
    await expect(svc.update('u1', UID(1), { nameEn: 'hack' })).rejects.toMatchObject({ response: { code: 'SYSTEM_CATEGORY_READONLY' } });
    await expect(svc.remove('u1', UID(1))).rejects.toMatchObject({ response: { code: 'SYSTEM_CATEGORY_READONLY' } });
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.category.updateMany).not.toHaveBeenCalled();
  });

  it('moving a category that already has children under a parent would make 3 levels: refused', async () => {
    const { svc, prisma } = setup();
    prisma.category.findFirst.mockResolvedValueOnce(cat()).mockResolvedValueOnce(cat({ id: UID(9) }));
    prisma.category.count.mockResolvedValue(2);
    await expect(svc.update('u1', UID(1), { parentId: UID(9) })).rejects.toMatchObject({ response: { code: 'CATEGORY_DEPTH_EXCEEDED' } });
  });

  it('delete removes the category, its children, their budgets and rules in one transaction', async () => {
    const { svc, prisma } = setup();
    prisma.category.findFirst.mockResolvedValue(cat());
    prisma.category.findMany.mockResolvedValue([{ id: UID(2) }]);
    await svc.remove('u1', UID(1));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.category.updateMany).toHaveBeenCalledWith({ where: { id: { in: [UID(1), UID(2)] } }, data: { deletedAt: expect.any(Date) } });
    expect(prisma.budget.updateMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', categoryId: { in: [UID(1), UID(2)] } });
    expect(prisma.categoryRule.updateMany).toHaveBeenCalled();
  });

  it('unknown / malformed / foreign ids are 404; assertUsable enforces the transaction type', async () => {
    const { svc, prisma } = setup();
    prisma.category.findFirst.mockResolvedValue(null);
    await expect(svc.update('u1', 'not-a-uuid', { nameEn: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.assertUsable('u1', UID(1), 'EXPENSE')).rejects.toMatchObject({ status: 404 });
    prisma.category.findFirst.mockResolvedValue(cat({ type: 'INCOME' }));
    await expect(svc.assertUsable('u1', UID(1), 'EXPENSE')).rejects.toMatchObject({ response: { code: 'CATEGORY_TYPE_MISMATCH' } });
  });
});

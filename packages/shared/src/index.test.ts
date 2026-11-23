import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetPeriod, currentBudgetPeriod, RegisterSchema } from './index';

test('BUD-04 period: salary on the 5th -> 5 Nov to 4 Dec', () => {
  const p = budgetPeriod(new Date(Date.UTC(2026, 10, 21)), 5);
  assert.equal(p.start.toISOString(), '2026-11-05T00:00:00.000Z');
  assert.equal(p.end.toISOString(), '2026-12-05T00:00:00.000Z');
});

test('period before start day belongs to previous month', () => {
  const p = budgetPeriod(new Date(Date.UTC(2026, 10, 2)), 5);
  assert.equal(p.start.toISOString(), '2026-10-05T00:00:00.000Z');
});

test('currentBudgetPeriod uses Vietnam wall-clock: 17:30Z on 31 Oct is already 1 Nov in VN', () => {
  const p = currentBudgetPeriod(new Date('2026-10-31T17:30:00Z'), 1);
  assert.equal(p.periodStart.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(p.startsAt.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(p.endsAt.toISOString(), '2026-11-30T17:00:00.000Z');
});

test('AUTH-01 schema: rejects weak passwords and unknown keys', () => {
  const ok = { email: ' A@B.com ', password: 'abcdef12', fullName: 'An' };
  assert.equal(RegisterSchema.parse(ok).email, 'a@b.com');
  assert.equal(RegisterSchema.safeParse({ ...ok, password: 'abcdefgh' }).success, false);
  assert.equal(RegisterSchema.safeParse({ ...ok, role: 'ADMIN' }).success, false);
});

import { ApplyTemplateSchema, BUDGET_TEMPLATES, CreateBudgetSchema, formatPeriod, periodBounds, periodFromMonth, periodStartFor, preselectCategory, shiftPeriodStart, SuggestCategoryBodySchema } from './index';

test('BUD period helpers: YYYY-MM is the month the period STARTS in, bounds are Vietnam midnights', () => {
  const start = periodFromMonth('2026-11', 5);
  assert.equal(start.toISOString(), '2026-11-05T00:00:00.000Z');
  const b = periodBounds(start);
  assert.equal(b.startsAt.toISOString(), '2026-11-04T17:00:00.000Z');
  assert.equal(b.endsAt.toISOString(), '2026-12-04T17:00:00.000Z'); // 5 Nov .. 4 Dec inclusive
  assert.equal(formatPeriod(start), '2026-11');
  assert.equal(shiftPeriodStart(start, -3).toISOString(), '2026-08-05T00:00:00.000Z');
  assert.equal(shiftPeriodStart(start, 2).toISOString(), '2027-01-05T00:00:00.000Z');
});

test('periodStartFor: 3 Nov with month_start_day 5 still belongs to the period that started 5 Oct', () => {
  assert.equal(periodStartFor(new Date('2026-11-03T05:00:00Z'), 5).toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(formatPeriod(periodStartFor(new Date('2026-11-03T05:00:00Z'), 5)), '2026-10');
});

test('templates follow the spec: 50/30/20 and 6 jars add up to 100%', () => {
  for (const t of Object.values(BUDGET_TEMPLATES)) assert.equal(t.reduce((a, g) => a + g.percent, 0), 100);
  const t = BUDGET_TEMPLATES['50_30_20'];
  assert.deepEqual(t[0].categories, ['Housing', 'Food & Drinks', 'Transport', 'Bills']);
  assert.deepEqual(t[1].categories, ['Shopping', 'Entertainment']);
  assert.deepEqual(t[2].categories, []); // savings = goals
  assert.deepEqual(BUDGET_TEMPLATES['6_JARS'].map((g) => g.percent), [55, 10, 10, 10, 10, 5]);
});

test('ApplyTemplateSchema: custom percentages must total exactly 100; groups only with CUSTOM', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const ok = { template: 'CUSTOM', monthlyIncome: 10_000_000, groups: [{ name: 'a', percent: 60, categoryIds: [id] }, { name: 'savings', percent: 40, categoryIds: [] }] };
  assert.equal(ApplyTemplateSchema.safeParse(ok).success, true);
  assert.equal(ApplyTemplateSchema.safeParse({ ...ok, groups: [{ name: 'a', percent: 60, categoryIds: [id] }, { name: 'b', percent: 39, categoryIds: [] }] }).success, false);
  assert.equal(ApplyTemplateSchema.safeParse({ ...ok, groups: [{ name: 'a', percent: 60, categoryIds: [id] }, { name: 'b', percent: 41, categoryIds: [] }] }).success, false);
  assert.equal(ApplyTemplateSchema.safeParse({ template: 'CUSTOM', monthlyIncome: 1 }).success, false);
  assert.equal(ApplyTemplateSchema.safeParse({ template: '50_30_20', monthlyIncome: 1, groups: ok.groups }).success, false);
  assert.equal(ApplyTemplateSchema.parse({ template: '6_JARS', monthlyIncome: 1_000_000 }).overwrite, false);
});

test('CreateBudgetSchema / SuggestCategoryBodySchema reject unknown keys and bad periods', () => {
  assert.equal(CreateBudgetSchema.safeParse({ categoryId: null, limitAmount: 1, period: '2026-13' }).success, false);
  assert.equal(CreateBudgetSchema.safeParse({ categoryId: null, limitAmount: 1, period: '2026-11' }).success, true);
  assert.equal(CreateBudgetSchema.safeParse({ categoryId: null, limitAmount: 1, userId: 'x' }).success, false);
  assert.equal(SuggestCategoryBodySchema.safeParse({ note: 'cà phê', amount: 45_000 }).success, true);
  assert.equal(SuggestCategoryBodySchema.safeParse({ note: 'x', amount: 1.5 }).success, false);
});

test('CAT-03 web rule: pre-select the top suggestion only at confidence >= 0.6', () => {
  assert.equal(preselectCategory([{ categoryId: 'a', confidence: 0.6 }, { categoryId: 'b', confidence: 0.3 }]), 'a');
  assert.equal(preselectCategory([{ categoryId: 'a', confidence: 0.59 }]), null);
  assert.equal(preselectCategory([]), null);
});

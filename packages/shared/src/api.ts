import { z } from 'zod';
import { CategoryType, Frequency, GoalStatus, Money, TransactionSource, TransactionType, WalletType } from './base';

const Uuid = z.string().uuid();
const IsoDateTime = z.string().datetime();
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const nonEmpty = { message: 'at least one field is required' };
const hasKeys = (v: object) => Object.keys(v).length > 0;
const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

// ---------------- wallets (WAL-01/02) ----------------
export const UpdateWalletSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: WalletType,
    color: HexColor.nullable(),
    isArchived: z.boolean(),
    openingBalance: Money,
  })
  .partial()
  .strict()
  .refine(hasKeys, nonEmpty);
export const ListWalletsQuerySchema = z.object({ includeArchived: boolString.optional() }).strict();

// ---------------- transactions (TXN-01..04) ----------------
export const TransactionSort = z.enum(['occurredAt:desc', 'occurredAt:asc', 'amount:desc', 'amount:asc']);
const DateOrDateTime = z.union([IsoDateTime, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
export const TransactionQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: TransactionSort.default('occurredAt:desc'),
    from: DateOrDateTime.optional(), // date-only = start of that Vietnam day
    to: DateOrDateTime.optional(), // date-only = end of that Vietnam day (inclusive)
    type: TransactionType.optional(),
    walletId: Uuid.optional(), // matches source or destination wallet of a transfer
    categoryId: Uuid.optional(),
    minAmount: z.coerce.number().int().min(0).optional(),
    maxAmount: z.coerce.number().int().min(0).optional(),
    q: z.string().trim().min(1).max(100).optional(), // keyword in note, case-insensitive
  })
  .strict()
  .refine((v) => v.minAmount === undefined || v.maxAmount === undefined || v.minAmount <= v.maxAmount, { message: 'minAmount must be <= maxAmount' });

export const UpdateTransactionSchema = z
  .object({
    walletId: Uuid,
    categoryId: Uuid.nullable(),
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: Money.positive(),
    note: z.string().max(500).nullable(),
    occurredAt: IsoDateTime,
    receiptKey: z.string().max(300).nullable(),
  })
  .partial()
  .strict()
  .refine(hasKeys, nonEmpty);

export const ReceiptUploadSchema = z
  .object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), size: Money.positive().max(MAX_RECEIPT_BYTES) })
  .strict();

// ---------------- CSV import (TXN-06) ----------------
export const ImportCsvBodySchema = z.object({ walletId: Uuid }).strict();
export const ConfirmImportSchema = z
  .object({ includeDuplicates: z.boolean().default(false), excludeLines: z.array(z.number().int().min(1)).max(MAX_CSV_ROWS).default([]) })
  .strict();

// ---------------- recurring rules (TXN-05) ----------------
const RecurringBase = z
  .object({
    walletId: Uuid,
    categoryId: Uuid.nullable().optional(),
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: Money.positive(),
    note: z.string().max(500).nullable().optional(),
    frequency: Frequency,
    interval: z.number().int().min(1).max(365).default(1),
    nextRunAt: IsoDateTime,
    endAt: IsoDateTime.nullable().optional(),
  })
  .strict();
export const CreateRecurringRuleSchema = RecurringBase.refine((v) => !v.endAt || new Date(v.endAt) > new Date(v.nextRunAt), { message: 'endAt must be after nextRunAt' });
export const UpdateRecurringRuleSchema = RecurringBase.partial().refine(hasKeys, nonEmpty);

// ---------------- categories (CAT-01/02) ----------------
export const CreateCategorySchema = z
  .object({
    nameVi: z.string().trim().min(1).max(60),
    nameEn: z.string().trim().min(1).max(60),
    type: CategoryType,
    parentId: Uuid.nullable().optional(), // max 2 levels: parent must itself be a root
    icon: z.string().max(40).optional(),
    color: HexColor.optional(),
  })
  .strict();
export const UpdateCategorySchema = z
  .object({
    nameVi: z.string().trim().min(1).max(60),
    nameEn: z.string().trim().min(1).max(60),
    icon: z.string().max(40).nullable(),
    color: HexColor.nullable(),
    parentId: Uuid.nullable(),
  })
  .partial()
  .strict()
  .refine(hasKeys, nonEmpty);
export const ListCategoriesQuerySchema = z.object({ type: CategoryType.optional() }).strict();
export const SuggestCategoryQuerySchema = z.object({ note: z.string().max(500).default('') }).strict();

// ---------------- goals (GOAL-01/02) ----------------
export const UpdateGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    targetAmount: Money.positive(),
    deadline: IsoDateTime.nullable(),
    walletId: Uuid.nullable(),
    status: z.enum(['ACTIVE', 'CANCELED']),
  })
  .partial()
  .strict()
  .refine(hasKeys, nonEmpty);
export const ContributionSchema = z
  .object({
    amount: Money.refine((v) => v !== 0, { message: 'must not be zero' }), // + deposit, - withdrawal
    occurredAt: IsoDateTime.optional(),
    note: z.string().max(200).optional(),
  })
  .strict();

// ---------------- response shapes (also used for OpenAPI + contract tests) ----------------
export const PageMetaSchema = z.object({ page: z.number().int(), limit: z.number().int(), total: z.number().int() });

export const WalletOut = z.object({
  id: Uuid, name: z.string(), type: WalletType, openingBalance: Money, currency: z.string(), color: z.string().nullable(),
  isArchived: z.boolean(), balance: Money, createdAt: IsoDateTime, updatedAt: IsoDateTime,
});
export const TransactionOut = z.object({
  id: Uuid, walletId: Uuid, transferWalletId: Uuid.nullable(), categoryId: Uuid.nullable(), type: TransactionType, amount: Money,
  occurredAt: IsoDateTime, note: z.string().nullable(), receiptUrl: z.string().nullable(), recurringRuleId: Uuid.nullable(),
  source: TransactionSource, createdAt: IsoDateTime, updatedAt: IsoDateTime,
});
export const CategoryOut = z.object({
  id: Uuid, isSystem: z.boolean(), parentId: Uuid.nullable(), nameVi: z.string(), nameEn: z.string(), type: CategoryType,
  icon: z.string().nullable(), color: z.string().nullable(),
});
export const GoalOut = z.object({
  id: Uuid, name: z.string(), targetAmount: Money, savedAmount: Money, remainingAmount: Money, percent: z.number(),
  deadline: IsoDateTime.nullable(), walletId: Uuid.nullable(), status: GoalStatus,
  requiredMonthlySaving: Money.nullable(), createdAt: IsoDateTime, updatedAt: IsoDateTime,
});
export const ContributionOut = z.object({ id: Uuid, goalId: Uuid, amount: Money, occurredAt: IsoDateTime, note: z.string().nullable(), createdAt: IsoDateTime });
export const ContributionResultOut = z.object({ contribution: ContributionOut, goal: GoalOut });
export const RecurringRuleOut = z.object({
  id: Uuid, walletId: Uuid, categoryId: Uuid.nullable(), type: CategoryType, amount: Money, note: z.string().nullable(),
  frequency: Frequency, interval: z.number().int(), nextRunAt: IsoDateTime, endAt: IsoDateTime.nullable(), createdAt: IsoDateTime, updatedAt: IsoDateTime,
});
export const ReceiptUploadOut = z.object({ key: z.string(), url: z.string(), fields: z.record(z.string()), maxBytes: z.number().int(), expiresIn: z.number().int() });
export const ImportRowOut = z.object({
  line: z.number().int(), date: IsoDateTime.nullable(), amount: Money.nullable(), type: z.enum(['INCOME', 'EXPENSE']).nullable(),
  note: z.string().nullable(), categoryId: Uuid.nullable(), duplicate: z.boolean(), errors: z.array(z.string()),
});
export const ImportPreviewOut = z.object({
  importId: Uuid, walletId: Uuid, expiresIn: z.number().int(), rows: z.array(ImportRowOut),
  summary: z.object({ total: z.number().int(), valid: z.number().int(), duplicates: z.number().int(), errors: z.number().int() }),
});
export const ImportConfirmOut = z.object({ imported: z.number().int(), skipped: z.number().int(), transactionIds: z.array(Uuid) });

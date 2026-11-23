import { z } from 'zod';

// ---- Enums (mirror prisma enums) ----
export const Role = z.enum(['USER', 'ADMIN']);
export const UserStatus = z.enum(['ACTIVE', 'LOCKED']);
export const PlanCode = z.enum(['FREE', 'PREMIUM']);
export const WalletType = z.enum(['CASH', 'BANK', 'EWALLET', 'CREDIT']);
export const CategoryType = z.enum(['INCOME', 'EXPENSE']);
export const TransactionType = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const TransactionSource = z.enum(['MANUAL', 'IMPORT', 'RECURRING']);
export const Frequency = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export const GoalStatus = z.enum(['ACTIVE', 'ACHIEVED', 'CANCELED']);
export const Locale = z.enum(['vi', 'en']);
export type Role = z.infer<typeof Role>;
export type PlanCode = z.infer<typeof PlanCode>;
export type WalletType = z.infer<typeof WalletType>;
export type TransactionType = z.infer<typeof TransactionType>;

// ---- Money: integer VND (BIGINT in DB). Transported as number (safe up to 9e15). ----
export const Money = z.number().int().safe();

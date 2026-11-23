import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { ApiError } from './client';

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isPlanLimit = (e: unknown): e is ApiError => isApiError(e) && e.code === 'PLAN_LIMIT_REACHED';

export interface PlanLimitDetails { key?: string; limit?: number; feature?: string; oldestPeriod?: string }
export const planLimitDetails = (e: ApiError): PlanLimitDetails => (e.details ?? {}) as PlanLimitDetails;

/** The user-facing sentence for an error (never a code, never blame). Keys live in locales under `errors.*`. */
export function describeError(e: unknown, t: TFunction): string {
  if (!isApiError(e)) return t('errors.unknown');
  switch (e.code) {
    case 'NETWORK_ERROR': return t('errors.network');
    case 'RATE_LIMITED': return t('errors.rateLimited');
    case 'VALIDATION_ERROR': return t('errors.validation');
    case 'PLAN_LIMIT_REACHED': return t('errors.planLimit');
    case 'SESSION_EXPIRED': return t('errors.sessionExpired');
    case 'INVALID_CREDENTIALS': return t('errors.invalidCredentials');
    case 'ACCOUNT_LOCKED': return t('errors.accountLocked');
    case 'EMAIL_NOT_VERIFIED': return t('errors.emailNotVerified');
    case 'EMAIL_TAKEN': return t('errors.emailTaken');
    case 'NOT_FOUND': return t('errors.notFound');
    case 'WALLET_ARCHIVED': return t('errors.walletArchived');
    case 'RESPONSE_SHAPE': return t('errors.unknown');
    default: return e.status >= 500 ? t('errors.server') : t('errors.unknown');
  }
}

/** VALIDATION_ERROR details are zod's `flatten()`: { formErrors: string[], fieldErrors: { field: string[] } } */
export function fieldErrorsOf(e: unknown): Record<string, string> {
  if (!isApiError(e) || e.code !== 'VALIDATION_ERROR') return {};
  const fe = (e.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors ?? {};
  return Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0] ?? '']));
}

/** put the server's field errors on the matching react-hook-form fields; returns true if anything was mapped */
export function applyFieldErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>): boolean {
  const fe = fieldErrorsOf(e);
  const keys = Object.keys(fe);
  for (const k of keys) setError(k as Path<T>, { type: 'server', message: fe[k] });
  return keys.length > 0;
}

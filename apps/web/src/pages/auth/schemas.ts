import { z } from 'zod';
import type { TFunction } from 'i18next';
import { checkPassword } from '@/lib/password';

/** same rules as @smartwallet/shared (the API stays the authority) with messages people can act on */
export const emailField = (t: TFunction) => z.string().trim().min(1, t('authx.emailRequired')).toLowerCase().email(t('authx.emailInvalid'));
export const passwordField = (t: TFunction) => z.string().min(1, t('authx.passwordRequired')).refine((v) => checkPassword(v).valid, t('authx.passwordInvalid'));

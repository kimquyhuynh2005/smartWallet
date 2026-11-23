import { ForbiddenException } from '@nestjs/common';

/** limit === null means unlimited. Throws 403 PLAN_LIMIT_REACHED. */
export function assertWithinLimit(limit: number | null | undefined, current: number, key: string) {
  if (limit !== null && limit !== undefined && current >= limit) {
    throw new ForbiddenException({ code: 'PLAN_LIMIT_REACHED', message: `Plan limit reached for ${key}`, details: { key, limit } });
  }
}

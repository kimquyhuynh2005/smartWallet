import i18n from '@/i18n';
import { toast, useUi } from '@/stores/ui';
import { isApiError, planLimitDetails } from './errors';
import { describeError } from './errors';

/**
 * Global error policy (wired into the QueryClient caches):
 *   PLAN_LIMIT_REACHED -> upgrade dialog   RATE_LIMITED -> toast   NETWORK_ERROR -> offline banner (set by the client)
 *   VALIDATION_ERROR   -> nothing here: the form shows field errors   SESSION_EXPIRED -> handled by the session watcher
 */
export function handleGlobalError(error: unknown, ctx: { kind: 'query' | 'mutation'; silent?: boolean }) {
  if (!isApiError(error) || ctx.silent) return;
  const t = i18n.t.bind(i18n);
  switch (error.code) {
    case 'PLAN_LIMIT_REACHED': {
      const d = planLimitDetails(error);
      useUi.getState().openUpgrade({ key: d.key, limit: d.limit, feature: d.feature });
      return;
    }
    case 'RATE_LIMITED': toast.warning(t('errors.rateLimited')); return;
    case 'NETWORK_ERROR': if (ctx.kind === 'mutation') toast.warning(t('errors.networkSave')); return;
    case 'SESSION_EXPIRED': case 'VALIDATION_ERROR': case 'UNAUTHORIZED': return;
    default:
      // mutations always tell the user; failed reads only when the server itself is at fault (the page shows its own empty/error state otherwise)
      if (ctx.kind === 'mutation' || error.status >= 500) toast.error(describeError(error, t));
  }
}

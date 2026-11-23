import { TriangleAlert } from 'lucide-react';
import { useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '@/ui';

/** A new deploy removes old chunk files: the next lazy import then fails. A reload fetches the new build. */
const isChunkError = (e: unknown) => /dynamically imported module|importing a module script|Loading chunk|Unable to preload/i.test(e instanceof Error ? e.message : String(e));

/** Last line of defence for a render crash or a failed lazy chunk: a calm screen instead of the router's raw error page. */
export default function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  if (import.meta.env.DEV) console.error('[route error]', error);
  const chunk = isChunkError(error);
  return (
    <main id="main" className="mx-auto max-w-xl p-6 pt-16">
      <h1 className="sr-only">{t('errors.crashTitle')}</h1>
      <EmptyState
        icon={TriangleAlert}
        title={chunk ? t('errors.updateTitle') : t('errors.crashTitle')}
        action={<Button onClick={() => window.location.reload()}>{chunk ? t('errors.updateAction') : t('common.retry')}</Button>}
      >
        {chunk ? t('errors.updateHint') : t('errors.crashHint')}
      </EmptyState>
    </main>
  );
}

import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUi } from '@/stores/ui';

/** Shown while a request fails with a network error; hides again on the next successful response. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const offline = useUi((s) => s.offline);
  if (!offline) return null;
  return (
    <div role="alert" className="sticky top-0 z-40 flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-2 text-sm font-medium text-warn">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t('offline.banner')}</span>
    </div>
  );
}

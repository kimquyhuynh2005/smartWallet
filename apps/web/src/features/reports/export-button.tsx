import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { describeError, useExportCsv, useProfile } from '@/api';
import { toast, useUi } from '@/stores/ui';
import { Button } from '@/ui';

export function ExportButton({ period, current }: { period: string; current?: string }) {
  const { t } = useTranslation('reports');
  const { t: tc } = useTranslation();
  const premium = useProfile().data?.plan === 'PREMIUM';
  const exp = useExportCsv();
  const run = () => {
    if (!premium) { useUi.getState().openUpgrade({ feature: 'csv_export' }); return; }
    exp.mutate(current, {
      onSuccess: (text) => {
        const url = URL.createObjectURL(new Blob([text.startsWith('﻿') ? text : '﻿' + text], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `smartwallet-${period}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(t('export.done'));
      },
      // a 403 PLAN_LIMIT_REACHED is already handled by the global dialog
      onError: (e) => { toast.error(t('export.failed'), describeError(e, tc)); },
    });
  };
  return <Button variant="secondary" onClick={run} loading={exp.isPending}><Download className="h-4 w-4" aria-hidden />{t('export.label')}</Button>;
}

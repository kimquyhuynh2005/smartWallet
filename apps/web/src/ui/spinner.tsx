import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <span role="status" className="inline-flex">
      <Loader2 className={cn('animate-spin text-current motion-reduce:animate-none', className)} aria-hidden />
      <span className="sr-only">{label ?? t('common.loading')}</span>
    </span>
  );
}

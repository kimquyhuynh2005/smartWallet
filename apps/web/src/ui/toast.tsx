import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUi, type Toast } from '@/stores/ui';
import { cn } from '@/lib/utils';

const KIND = {
  info: { Icon: Info, cls: 'text-ink-2' },
  success: { Icon: CircleCheck, cls: 'text-accent' },
  warning: { Icon: TriangleAlert, cls: 'text-warn' },
  error: { Icon: CircleAlert, cls: 'text-danger' },
} as const;

function ToastItem({ t: toast }: { t: Toast }) {
  const { t } = useTranslation();
  const dismiss = useUi((s) => s.dismissToast);
  const { Icon, cls } = KIND[toast.kind];
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.kind === 'error' || toast.action ? 9000 : 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.kind, toast.action, dismiss]);
  return (
    <div
      role={toast.kind === 'error' || toast.kind === 'warning' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-3 pr-2 shadow-float animate-toast-in"
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm text-ink-2">{toast.description}</p>}
        {toast.action && (
          <button type="button" onClick={() => { toast.action!.onClick(); dismiss(toast.id); }} className="mt-1 min-h-9 text-sm font-medium text-accent underline-offset-4 hover:underline">
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" onClick={() => dismiss(toast.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink" aria-label={t('common.dismiss')}>
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Mount once. Bottom-center on phones (above the tab bar), bottom-right on desktop. */
export function ToastViewport() {
  const { t } = useTranslation();
  const toasts = useUi((s) => s.toasts);
  return (
    <div role="region" aria-label={t('ui.toastRegion')} className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-[60] lg:bottom-6 lg:top-auto mx-auto flex w-full max-w-sm flex-col gap-2 px-4 lg:left-auto lg:right-6 lg:mx-0 lg:px-0">
      {toasts.map((x) => <ToastItem key={x.id} t={x} />)}
    </div>
  );
}

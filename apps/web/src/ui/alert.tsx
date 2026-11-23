import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  info: { Icon: Info, cls: 'border-line bg-sunken text-ink-2' },
  success: { Icon: CircleCheck, cls: 'border-accent/30 bg-accent-soft text-accent' },
  warning: { Icon: TriangleAlert, cls: 'border-warn/30 bg-warn-soft text-warn' },
  danger: { Icon: CircleAlert, cls: 'border-danger/30 bg-danger-soft text-danger' },
} as const;

/** Inline message. Always icon + text; role=alert for warning/danger so it is announced. */
export function Alert({ tone = 'info', children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  const { Icon, cls } = TONES[tone];
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm font-medium', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

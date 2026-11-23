import type { ReactNode } from 'react';
import { Card } from '@/ui';

/** A titled card used by every settings screen. */
export function Section({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 max-w-prose text-sm text-ink-2">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

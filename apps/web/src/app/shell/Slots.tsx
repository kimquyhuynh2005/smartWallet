import { lazy, Suspense, useEffect, useState } from 'react';
import { NotificationBell } from '@/features/notifications';
import { useUi } from '@/stores/ui';

/**
 * Shell slots. The shell decides WHERE and WHEN; the feature folder decides WHAT.
 *  - NotificationBellSlot renders features/notifications (NotificationBell)
 *  - QuickAddSlot renders features/quick-add (QuickAdd), opened by the add buttons and the N shortcut through useUi.openQuickAdd()
 */
export const NotificationBellSlot = () => <NotificationBell />;

const QuickAdd = lazy(() => import('@/features/quick-add').then((m) => ({ default: m.QuickAdd })));

/** loaded the first time it is opened, then kept mounted so the form keeps its state while closed */
export function QuickAddSlot() {
  const open = useUi((s) => s.quickAddOpen);
  const [wanted, setWanted] = useState(false);
  useEffect(() => { if (open) setWanted(true); }, [open]);
  return wanted ? <Suspense fallback={null}><QuickAdd /></Suspense> : null;
}

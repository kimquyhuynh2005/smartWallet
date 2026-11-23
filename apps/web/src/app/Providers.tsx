import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useUi } from '@/stores/ui';
import { ToastViewport } from '@/ui';
import { PlanLimitDialog } from './PlanLimitDialog';

/** light / dark / system -> the `dark` class on <html> (the inline script in index.html sets it before first paint, this keeps it in sync) */
function ThemeEffect() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16130F' : '#FBF8F3');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeEffect />
      {children}
      <PlanLimitDialog />
      <ToastViewport />
    </QueryClientProvider>
  );
}

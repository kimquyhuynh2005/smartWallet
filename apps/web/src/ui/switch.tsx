import { cn } from '@/lib/utils';

/** On/off setting. A real button with role=switch: keyboard + screen-reader correct; the state is also written next to it by the caller. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-7 w-12 shrink-0 items-center before:absolute before:-inset-2 before:content-[""] rounded-full border transition-colors disabled:opacity-50', checked ? 'border-accent bg-accent' : 'border-control bg-sunken')}
    >
      <span className={cn('h-5 w-5 rounded-full bg-surface shadow-[0_0_0_1px_rgb(var(--control))] transition-transform duration-150 motion-reduce:transition-none', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** A small ledger-page mark (two ruled lines and a margin) + the wordmark. No coins, no gradients. */
export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-md text-base md:text-lg font-semibold tracking-tight text-ink', className)} aria-label="SmartWallet">
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
        <rect x="3" y="3" width="22" height="22" rx="6" fill="rgb(var(--accent))" />
        <path d="M9 10.5h10M9 14.5h10M9 18.5h6" stroke="rgb(var(--accent-ink))" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>SmartWallet</span>
    </Link>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const HUES = ['food', 'transport', 'housing', 'shopping', 'entertainment', 'education', 'gifts', 'salary'] as const;
const SIZE = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' } as const;

/** Vietnamese name order: the initials are the first letter of the family name and of the given name ("Nguyễn Minh Anh" -> "NA"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toLocaleUpperCase('vi-VN');
}
const hueOf = (name: string) => HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

/** `decorative`: the surrounding control already names the person, so screen readers skip the picture. */
export function Avatar({ name, src, size = 'md', className, decorative }: { name: string; src?: string | null; size?: keyof typeof SIZE; className?: string; decorative?: boolean }) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const label = t('ui.avatarOf', { name });
  if (src && !broken) return <img src={src} alt={decorative ? '' : label} onError={() => setBroken(true)} className={cn('shrink-0 rounded-full object-cover ring-1 ring-line', SIZE[size], className)} />;
  const color = `rgb(var(--cat-${hueOf(name)}))`;
  return (
    <span {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })} className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink', SIZE[size], className)} style={{ backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)` }}>
      {initialsOf(name)}
    </span>
  );
}

import { Check, Eye, EyeOff, Minus } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { checkPassword } from '@/lib/password';
import { cn } from '@/lib/utils';
import { Input } from './input';

/** Password input with a show/hide button (44px target). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean }>((p, ref) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <Input
      ref={ref} {...p} type={shown ? 'text' : 'password'} autoCapitalize="none" spellCheck={false}
      trailing={
        <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? t('authx.hidePassword') : t('authx.showPassword')} className="pointer-events-auto -mr-2 flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:text-ink">
          {shown ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      }
    />
  );
});
PasswordInput.displayName = 'PasswordInput';

const LEVEL_KEY = ['empty', 'weak', 'fair', 'good', 'strong'] as const;

/** Four-segment meter + word + rule checklist: strength is never colour alone. */
export function PasswordStrength({ value, id }: { value: string; id?: string }) {
  const { t } = useTranslation();
  const c = checkPassword(value);
  const rules = [['len', c.len], ['letter', c.letter], ['digit', c.digit], ['long', c.long]] as const;
  return (
    <div id={id} className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" role="img" aria-label={`${t('authx.strength.label')}: ${t(`authx.strength.${LEVEL_KEY[c.level]}`)}`}>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= c.level ? (c.level <= 1 ? 'bg-danger' : c.level === 2 ? 'bg-warn' : 'bg-accent') : 'bg-sunken ring-1 ring-inset ring-line')} />
          ))}
        </div>
        <span className="min-w-[4.5rem] whitespace-nowrap text-right text-sm font-medium text-ink-2">{t(`authx.strength.${LEVEL_KEY[c.level]}`)}</span>
      </div>
      <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {rules.map(([k, ok]) => (
          <li key={k} className={cn('flex items-center gap-1.5', ok ? 'text-accent' : 'text-ink-2')}>
            {ok ? <Check className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
            <span>{t(`authx.strength.${k}`)}</span>
            <span className="sr-only">: {ok ? t('authx.strength.met') : t('authx.strength.unmet')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_RECEIPT_BYTES } from '@smartwallet/shared';
import { Button } from '@/ui';

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Optional receipt photo (TXN-01): validates type and size (<= 5 MB), shows a thumbnail with a remove button. The upload itself happens on save. */
export function ReceiptPicker({ file, onChange, disabled }: { file: File | null; onChange: (f: File | null) => void; disabled?: boolean }) {
  const { t } = useTranslation('quick-add');
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!(RECEIPT_TYPES as readonly string[]).includes(f.type)) return setError(t('receipt.badType'));
    if (f.size > MAX_RECEIPT_BYTES) return setError(t('receipt.tooBig'));
    setError(null);
    onChange(f);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2 text-sm font-medium text-ink">{t('receipt.label')}</span>
      <input ref={input} type="file" accept={RECEIPT_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {file && url ? (
        <div className="flex items-center gap-3">
          <img src={url} alt={t('receipt.preview')} className="h-16 w-16 rounded-md border border-line object-cover" />
          <div className="min-w-0 flex-1 text-sm text-ink-2"><p className="truncate">{file.name}</p><p className="num">{(file.size / 1024 / 1024).toFixed(1)} MB</p></div>
          <Button variant="ghost" size="icon" onClick={() => onChange(null)} disabled={disabled} aria-label={t('receipt.remove')}><X className="h-5 w-5" aria-hidden /></Button>
        </div>
      ) : (
        <Button variant="secondary" className="justify-start" onClick={() => input.current?.click()} disabled={disabled}><Camera className="h-5 w-5" aria-hidden />{t('receipt.add')}</Button>
      )}
      <p className={error ? 'text-sm text-danger' : 'text-sm text-ink-3'} role={error ? 'alert' : undefined}>{error ?? t('receipt.hint')}</p>
    </div>
  );
}

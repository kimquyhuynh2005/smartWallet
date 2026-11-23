/** All number/date formatting for the UI lives here (vi default, en). Money is whole dong, never decimals. */
export type Lang = 'vi' | 'en';
export const TZ = 'Asia/Ho_Chi_Minh';
const NBSP = ' ';
const MINUS = '−'; // a real minus sign, not a hyphen: it lines up with "+" in tabular columns

const group = (n: number, lang: Lang) => String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'vi' ? '.' : ',');

export interface MoneyParts { sign: '' | '+' | typeof MINUS; number: string; unit: string; unitFirst: boolean }

/** vi: `1.500.000 ₫`, en: `1,500,000 VND`. sign: 'auto' = only minus, 'always' = + for positive, 'never' = absolute value */
export function moneyParts(amount: number, lang: Lang, sign: 'auto' | 'always' | 'never' = 'auto'): MoneyParts {
  const s = sign === 'never' ? '' : amount < 0 ? MINUS : sign === 'always' && amount > 0 ? '+' : '';
  return { sign: s, number: group(amount, lang), unit: lang === 'vi' ? '₫' : 'VND', unitFirst: false };
}
export function formatMoney(amount: number, lang: Lang, sign: 'auto' | 'always' | 'never' = 'auto'): string {
  const p = moneyParts(amount, lang, sign);
  return `${p.sign}${p.number}${NBSP}${p.unit}`;
}

/** short form for charts and tight rows: vi 1,5 tr / 350 k / 1,2 tỷ, en 1.5M / 350K / 1.2B */
export function formatCompact(amount: number, lang: Lang): string {
  const a = Math.abs(amount);
  const sign = amount < 0 ? MINUS : '';
  const dec = (x: number) => { const r = Math.round(x * 10) / 10; return lang === 'vi' ? String(r).replace('.', ',') : String(r); };
  if (a >= 1e9) return `${sign}${dec(a / 1e9)}${lang === 'vi' ? ' tỷ' : 'B'}`;
  if (a >= 1e6) return `${sign}${dec(a / 1e6)}${lang === 'vi' ? ' tr' : 'M'}`;
  if (a >= 1e3) return `${sign}${dec(a / 1e3)}${lang === 'vi' ? ' k' : 'K'}`;
  return `${sign}${a}`;
}

/** text typed in a money field -> integer (digits only). "1.500.000" -> 1500000, "" -> null */
export function parseMoneyInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits.slice(0, 15));
  return Number.isSafeInteger(n) ? n : null;
}
/** integer -> text for the field (grouped as you type) */
export const formatMoneyInput = (n: number | null | undefined, lang: Lang): string => (n === null || n === undefined ? '' : group(n, lang));

// ---------- dates (always Vietnam calendar days) ----------
const dtf = (lang: Lang, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: TZ, ...o });
const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

export function formatDate(d: Date | string | number, lang: Lang, style: 'short' | 'long' | 'day' | 'time' | 'monthYear' = 'short'): string {
  const date = toDate(d);
  switch (style) {
    case 'short': return dtf(lang, { day: '2-digit', month: lang === 'vi' ? '2-digit' : 'short', year: 'numeric' }).format(date).replace(/,/g, '');
    case 'long': return dtf(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    case 'day': return dtf(lang, { day: 'numeric', month: lang === 'vi' ? 'numeric' : 'short' }).format(date);
    case 'time': return dtf(lang, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    case 'monthYear': return lang === 'vi' ? `Tháng ${dtf(lang, { month: 'numeric', year: 'numeric' }).format(date)}` : dtf(lang, { month: 'long', year: 'numeric' }).format(date);
  }
}
/** yyyy-MM-dd of the Vietnam calendar day */
export const vnDayKey = (d: Date | string | number): string => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(toDate(d));
export function relativeDay(d: Date | string | number, now: Date = new Date()): 'today' | 'yesterday' | null {
  const k = vnDayKey(d);
  if (k === vnDayKey(now)) return 'today';
  if (k === vnDayKey(new Date(now.getTime() - 86_400_000))) return 'yesterday';
  return null;
}
/** "2026-11" -> "Tháng 11/2026" / "November 2026" */
export function formatPeriodLabel(yyyyMm: string, lang: Lang): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return formatDate(new Date(Date.UTC(y, m - 1, 15, 5)), lang, 'monthYear');
}
export const formatPercent = (n: number, lang: Lang) => `${(Math.round(n * 10) / 10).toString().replace('.', lang === 'vi' ? ',' : '.')}%`;

import { normalizeText } from '@smartwallet/shared';

const VN_OFFSET_H = 7;

/** RFC-4180 parser: quoted fields, escaped quotes, CRLF/LF, embedded newlines, BOM. Delimiter is auto-detected (, ; or tab). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row); // skip blank lines
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * CSV/formula injection guard: a cell that a spreadsheet would execute (= + - @ tab CR) is prefixed with a single quote
 * so it is stored and re-exported as inert text. Applied to every free-text cell we keep (never to the parsed amount).
 */
export function sanitizeCell(raw: string): string {
  const s = raw.trim();
  // test the RAW value too: trimming first would strip a leading tab/CR and let "\t=cmd" through
  return /^[=+\-@\t\r]/.test(raw) || /^\s*[=+\-@]/.test(raw) ? `'${s}` : s;
}

/** VND is integer. Accepts 1500000, 1.500.000, 1,500,000, "1 500 000đ", (50.000), -50000, 1500000.00. Rejects real decimals. */
export function parseAmountVnd(raw: string): number | null {
  let s = raw.trim().replace(/[đ₫]|vn[dđ]/gi, '').replace(/\s/g, '');
  if (!s) return null;
  const neg = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/^[-+]/, '').replace(/[()]/g, '');
  let digits: string | null = null;
  if (/^\d+$/.test(s)) digits = s;
  else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) digits = s.replace(/[.,]/g, '');
  else if (/^\d+[.,]0{1,2}$/.test(s)) digits = s.replace(/[.,]0+$/, '');
  else if (/^\d{1,3}([.,]\d{3})+[.,]0{1,2}$/.test(s)) digits = s.replace(/[.,]0{1,2}$/, '').replace(/[.,]/g, '');
  if (digits === null) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n)) return null;
  return neg ? -n : n;
}

/** dd/MM/yyyy (Vietnamese default), d-M-yyyy, yyyy-MM-dd, ISO 8601; optional HH:mm[:ss]. No time => 12:00 Vietnam time. Real calendar dates only. */
export function parseCsvDate(raw: string): Date | null {
  const s = raw.trim();
  let y: number, mo: number, d: number, h = 12, mi = 0, se = 0, tz: string | undefined;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (m[4] !== undefined) [h, mi, se] = [+m[4], +m[5], +(m[6] ?? 0)];
    tz = m[7];
  } else if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (m[4] !== undefined) [h, mi, se] = [+m[4], +m[5], +(m[6] ?? 0)];
  } else return null;
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59 || se > 59) return null;
  if (tz) {
    if (tz === 'Z') return probe;
    const sign = tz[0] === '-' ? -1 : 1;
    const t = tz.replace(/[^\d]/g, '');
    return new Date(probe.getTime() - sign * (+t.slice(0, 2) * 60 + +t.slice(2, 4)) * 60_000);
  }
  return new Date(probe.getTime() - VN_OFFSET_H * 3_600_000); // wall-clock in Vietnam
}

/** yyyy-MM-dd of a Vietnam calendar day (used for duplicate detection). */
export const vnDay = (d: Date) => new Date(d.getTime() + VN_OFFSET_H * 3_600_000).toISOString().slice(0, 10);

const HEADERS = {
  date: ['date', 'ngay', 'ngay giao dich', 'transaction date', 'thoi gian'],
  amount: ['amount', 'so tien', 'gia tri', 'value'],
  note: ['note', 'description', 'memo', 'noi dung', 'mo ta', 'ghi chu', 'details'],
  type: ['type', 'loai', 'kind'],
  category: ['category', 'danh muc', 'nhom'],
} as const;
export type Column = keyof typeof HEADERS;

export function mapHeader(header: string[]): Partial<Record<Column, number>> {
  const out: Partial<Record<Column, number>> = {};
  header.forEach((h, i) => {
    const n = normalizeText(h);
    for (const col of Object.keys(HEADERS) as Column[]) if (out[col] === undefined && (HEADERS[col] as readonly string[]).includes(n)) out[col] = i;
  });
  return out;
}

export function parseType(raw: string): 'INCOME' | 'EXPENSE' | null {
  const n = normalizeText(raw);
  if (['income', 'in', 'credit', 'thu', 'thu nhap', 'cr'].includes(n)) return 'INCOME';
  if (['expense', 'out', 'debit', 'chi', 'chi tieu', 'dr'].includes(n)) return 'EXPENSE';
  return null;
}

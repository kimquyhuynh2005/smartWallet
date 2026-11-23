import { mapHeader, parseAmountVnd, parseCsv, parseCsvDate, parseType, sanitizeCell, vnDay } from './csv';

describe('TXN-06 csv.parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas/newlines, CRLF and BOM', () => {
    const rows = parseCsv('﻿date,note,amount\r\n01/11/2026,"Ăn trưa, quán ""A""",50000\r\n02/11/2026,"line1\nline2",1000\r\n');
    expect(rows).toEqual([['date', 'note', 'amount'], ['01/11/2026', 'Ăn trưa, quán "A"', '50000'], ['02/11/2026', 'line1\nline2', '1000']]);
  });
  it('auto-detects the semicolon delimiter used by Vietnamese Excel and skips blank lines', () => {
    expect(parseCsv('a;b;c\n\n1;2;3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
});

describe('TXN-06 sanitizeCell (formula injection)', () => {
  it.each(['=SUM(A1:A9)', '+1+1', '-2+3', '@cmd', '\tcmd', '=HYPERLINK("http://evil")'])('neutralises %p', (v) => {
    expect(sanitizeCell(v)).toBe(`'${v.trim()}`);
  });
  it('leaves normal text alone and trims', () => {
    expect(sanitizeCell('  Cà phê  ')).toBe('Cà phê');
    expect(sanitizeCell('50% off')).toBe('50% off');
  });
});

describe('TXN-06 parseAmountVnd', () => {
  it.each([
    ['50000', 50000], ['1.500.000', 1500000], ['1,500,000', 1500000], ['1 500 000đ', 1500000], ['-50.000', -50000],
    ['(50.000)', -50000], ['1500000.00', 1500000], ['1.500.000,00', 1500000], ['250.000 VND', 250000],
  ])('%p -> %p', (raw, n) => expect(parseAmountVnd(raw)).toBe(n));
  it.each(['', 'abc', '12.5', '1,5', '1.2.3', '99999999999999999999'])('rejects %p', (raw) => expect(parseAmountVnd(raw)).toBeNull());
});

describe('TXN-06 parseCsvDate', () => {
  it('reads dd/MM/yyyy as Vietnam local time (12:00 default)', () => {
    expect(parseCsvDate('05/11/2026')!.toISOString()).toBe('2026-11-05T05:00:00.000Z');
    expect(parseCsvDate('5-11-2026 08:30')!.toISOString()).toBe('2026-11-05T01:30:00.000Z');
  });
  it('reads ISO dates and honours explicit offsets', () => {
    expect(parseCsvDate('2026-11-05')!.toISOString()).toBe('2026-11-05T05:00:00.000Z');
    expect(parseCsvDate('2026-11-05T10:00:00Z')!.toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(parseCsvDate('2026-11-05T10:00:00+07:00')!.toISOString()).toBe('2026-11-05T03:00:00.000Z');
  });
  it('rejects impossible dates and garbage', () => {
    for (const bad of ['31/02/2026', '2026-13-01', '32/01/2026', 'yesterday', '', '01/01/26']) expect(parseCsvDate(bad)).toBeNull();
  });
  it('vnDay uses the Vietnam calendar day', () => {
    expect(vnDay(new Date('2026-11-05T18:00:00Z'))).toBe('2026-11-06');
  });
});

describe('TXN-06 header + type mapping', () => {
  it('maps English and Vietnamese headers regardless of diacritics/case', () => {
    expect(mapHeader(['Ngày', 'Số tiền', 'Nội dung', 'Loại', 'Danh mục'])).toEqual({ date: 0, amount: 1, note: 2, type: 3, category: 4 });
    expect(mapHeader(['Date', 'Description', 'Amount'])).toEqual({ date: 0, note: 1, amount: 2 });
  });
  it('maps type words', () => {
    expect(parseType('Chi tiêu')).toBe('EXPENSE');
    expect(parseType('Thu nhập')).toBe('INCOME');
    expect(parseType('???')).toBeNull();
  });
});

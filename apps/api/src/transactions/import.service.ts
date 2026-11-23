import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MAX_CSV_ROWS, normalizeText } from '@smartwallet/shared';
import { CategoriesService, suggestCategory } from '../categories/categories.service';
import { DomainEvents } from '../common/domain-events.service';
import { TRANSACTION_CHANGED, TransactionChangedEvent, snapshot } from '../common/events';
import type { AuthUser } from '../common/jwt-auth.guard';
import { RedisService } from '../common/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { mapHeader, parseAmountVnd, parseCsv, parseCsvDate, parseType, sanitizeCell, vnDay } from './csv';
import { TransactionsRepository } from './transactions.repository';

const PREVIEW_TTL = 1800;
const DAY = 86_400_000;

interface StoredRow { line: number; occurredAt: string; amount: number; type: 'INCOME' | 'EXPENSE'; note: string | null; categoryId: string | null; duplicate: boolean }
interface Stored { walletId: string; rows: StoredRow[] }

/** TXN-06: upload -> preview (with duplicate flags, nothing written) -> confirm (single DB transaction). Premium only. */
@Injectable()
export class ImportService {
  constructor(
    private prisma: PrismaService,
    private repo: TransactionsRepository,
    private wallets: WalletsService,
    private categories: CategoriesService,
    private redis: RedisService,
    private events: DomainEvents,
  ) {}

  private key(userId: string, importId: string) {
    return `import:${userId}:${importId}`; // scoped by user: another user's importId simply does not exist
  }

  async preview(user: AuthUser, walletId: string, file: { buffer: Buffer; originalname?: string; mimetype?: string }) {
    await this.wallets.getUsable(user, walletId);
    const text = file.buffer.toString('utf8');
    if (text.includes('\u0000')) throw new UnprocessableEntityException({ code: 'INVALID_CSV', message: 'File is not a text CSV' });
    const table = parseCsv(text);
    if (table.length < 2) throw new UnprocessableEntityException({ code: 'INVALID_CSV', message: 'CSV needs a header row and at least one data row' });
    if (table.length - 1 > MAX_CSV_ROWS) throw new UnprocessableEntityException({ code: 'CSV_TOO_MANY_ROWS', message: `At most ${MAX_CSV_ROWS} rows per import`, details: { max: MAX_CSV_ROWS } });
    const col = mapHeader(table[0]);
    if (col.date === undefined || col.amount === undefined) {
      throw new UnprocessableEntityException({ code: 'CSV_MISSING_COLUMNS', message: 'CSV must have date and amount columns', details: { found: table[0], required: ['date', 'amount'] } });
    }

    const [visible, rules] = await Promise.all([this.categories.visible(user.id), this.categories.loadRules(user.id)]);
    const byName = new Map<string, { id: string; type: string }>();
    for (const c of visible) for (const n of [c.nameEn, c.nameVi]) byName.set(normalizeText(n), { id: c.id, type: c.type });

    const parsed = table.slice(1).map((cells, i) => {
      const line = i + 2; // header is line 1
      const errors: string[] = [];
      const date = parseCsvDate(cells[col.date!] ?? '');
      if (!date) errors.push('invalid date');
      const rawAmount = parseAmountVnd(cells[col.amount!] ?? '');
      const typeCell = col.type !== undefined ? (cells[col.type] ?? '').trim() : '';
      let type = typeCell ? parseType(typeCell) : null;
      if (rawAmount === null || rawAmount === 0) errors.push('invalid amount');
      if (typeCell && !type) errors.push('invalid type');
      if (!typeCell && rawAmount) type = rawAmount < 0 ? 'EXPENSE' : 'INCOME'; // no type given: bank statements use negative debits
      const amount = rawAmount === null ? null : Math.abs(rawAmount);
      const note = col.note !== undefined && (cells[col.note] ?? '').trim() ? sanitizeCell(cells[col.note]) : null;
      let categoryId: string | null = null;
      const catText = col.category !== undefined ? (cells[col.category] ?? '').trim() : '';
      const named = catText ? byName.get(normalizeText(catText)) : undefined;
      if (named && named.type === type) categoryId = named.id;
      else if (note) {
        const guess = suggestCategory(note, rules); // CAT-03
        const g = guess ? visible.find((c) => c.id === guess) : undefined;
        if (g && g.type === type) categoryId = g.id;
      }
      return { line, date, amount, type, note, categoryId, errors };
    });

    // duplicate = same wallet + type + amount + Vietnam day + same normalised note, already in the database
    const valid = parsed.filter((r) => !r.errors.length);
    const seen = new Set<string>();
    if (valid.length) {
      const times = valid.map((r) => r.date!.getTime());
      const existing = await this.repo.inWindow(user.id, walletId, new Date(Math.min(...times) - DAY), new Date(Math.max(...times) + 2 * DAY));
      for (const e of existing) seen.add(`${e.type}|${e.amount}|${vnDay(e.occurredAt)}|${normalizeText(e.note ?? '')}`);
    }
    const rows = parsed.map((r) => ({
      line: r.line, date: r.date, amount: r.amount, type: r.type, note: r.note, categoryId: r.categoryId, errors: r.errors,
      duplicate: !r.errors.length && seen.has(`${r.type}|${r.amount}|${vnDay(r.date!)}|${normalizeText(r.note ?? '')}`),
    }));

    const importId = randomUUID();
    const stored: Stored = {
      walletId,
      rows: rows.filter((r) => !r.errors.length).map((r) => ({ line: r.line, occurredAt: r.date!.toISOString(), amount: r.amount!, type: r.type!, note: r.note, categoryId: r.categoryId, duplicate: r.duplicate })),
    };
    await this.redis.client.set(this.key(user.id, importId), JSON.stringify(stored), 'EX', PREVIEW_TTL);
    return {
      importId, walletId, expiresIn: PREVIEW_TTL, rows,
      summary: { total: rows.length, valid: stored.rows.length, duplicates: rows.filter((r) => r.duplicate).length, errors: rows.filter((r) => r.errors.length).length },
    };
  }

  async confirm(user: AuthUser, importId: string, dto: { includeDuplicates: boolean; excludeLines: number[] }) {
    const key = this.key(user.id, importId);
    const raw = await this.redis.client.get(key);
    if (!raw) throw new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: 'Import preview not found, expired or already confirmed' });
    const data: Stored = JSON.parse(raw);
    await this.wallets.getUsable(user, data.walletId);
    if ((await this.redis.client.getdel(key)) === null) throw new NotFoundException({ code: 'IMPORT_NOT_FOUND', message: 'Import preview not found, expired or already confirmed' }); // lost a double-confirm race

    const skip = new Set(dto.excludeLines);
    const chosen = data.rows.filter((r) => !skip.has(r.line) && (dto.includeDuplicates || !r.duplicate));
    const live = new Set((await this.categories.visible(user.id)).map((c) => c.id)); // a category may have been deleted since the preview
    const created = chosen.length
      ? await this.prisma.$transaction((tx) =>
          tx.transaction.createManyAndReturn({
            data: chosen.map((r) => ({
              userId: user.id, walletId: data.walletId, type: r.type, amount: BigInt(r.amount), occurredAt: new Date(r.occurredAt),
              note: r.note, categoryId: r.categoryId && live.has(r.categoryId) ? r.categoryId : null, source: 'IMPORT' as const,
            })),
          }),
        )
      : [];
    if (created.length) {
      await this.wallets.invalidate(data.walletId);
      await this.events.publish<TransactionChangedEvent>(TRANSACTION_CHANGED, { userId: user.id, action: 'imported', current: created.map(snapshot), previous: [] });
    }
    return { imported: created.length, skipped: data.rows.length - created.length, transactionIds: created.map((c) => c.id) };
  }
}

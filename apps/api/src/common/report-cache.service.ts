import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Short-lived cache for report payloads. Every key embeds a per-user version, so invalidating a user is ONE increment
 * (no key scanning); stale keys simply expire. Best effort: if Redis is down reports are computed live.
 */
@Injectable()
export class ReportCache {
  constructor(private redis: RedisService) {}

  private async version(userId: string): Promise<string> {
    return (await this.redis.client.get(`report:ver:${userId}`)) ?? '0';
  }

  async get<T>(userId: string, name: string): Promise<T | null> {
    try {
      const raw = await this.redis.client.get(`report:${userId}:${await this.version(userId)}:${name}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  }

  /** money is BigInt: serialise it explicitly instead of relying on a global BigInt.prototype.toJSON patch */
  async set(userId: string, name: string, value: unknown, ttlSeconds = 60) {
    try { await this.redis.client.set(`report:${userId}:${await this.version(userId)}:${name}`, JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)), 'EX', ttlSeconds); } catch { /* ignore */ }
  }

  /** call after anything that changes a user's report numbers */
  async bump(userId: string) {
    try { await this.redis.client.incr(`report:ver:${userId}`); } catch { /* ignore */ }
  }
}

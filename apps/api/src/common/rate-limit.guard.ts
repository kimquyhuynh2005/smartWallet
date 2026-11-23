import { CanActivate, ExecutionContext, HttpException, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from './redis.service';

export const RATE_LIMIT_KEY = 'rate_limit';
/** @RateLimit(10, 'auth'): requests per minute. 'auth' scope is keyed by IP (callers are not logged in yet). */
export const RateLimit = (perMinute: number, scope = 'auth') => SetMetadata(RATE_LIMIT_KEY, { perMinute, scope });

const DEFAULT_PER_MINUTE = 100;

/** Fixed-window limiter in Redis. Global guard. Fails open (logged) if Redis is down. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private log = new Logger('RateLimit');
  constructor(private reflector: Reflector, private redis: RedisService, private jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext) {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return true;
    const meta = this.reflector.getAllAndOverride<{ perMinute: number; scope: string } | undefined>(RATE_LIMIT_KEY, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const scope = meta?.scope ?? 'api';
    const limit = meta?.perMinute ?? DEFAULT_PER_MINUTE;

    let id = `ip:${req.ip}`;
    if (scope !== 'auth') {
      try {
        const p: any = this.jwt.verify(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
        id = `user:${p.sub}`; // 100 req/min PER USER
      } catch { /* anonymous: fall back to IP */ }
    }

    const key = `rl:${scope}:${id}`;
    try {
      const out = await this.redis.client.multi().incr(key).expire(key, 60, 'NX').ttl(key).exec();
      const count = Number(out?.[0]?.[1]);
      const ttl = Number(out?.[2]?.[1]);
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
      if (count > limit) {
        res.setHeader('Retry-After', String(ttl > 0 ? ttl : 60));
        throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests' }, 429);
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.log.error(`redis unavailable, failing open: ${(e as Error).message}`);
    }
    return true;
  }
}

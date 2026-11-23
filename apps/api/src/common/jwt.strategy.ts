import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './jwt-auth.guard';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private prisma: PrismaService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_ACCESS_SECRET, ignoreExpiration: false });
  }

  /** Role/status come from the DB, so deleted, locked or demoted users lose access immediately (not after 15 min). */
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const u = await this.prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null }, select: { id: true, role: true, status: true } });
    if (!u || u.status !== 'ACTIVE') throw new UnauthorizedException();
    return { id: u.id, role: u.role };
  }
}

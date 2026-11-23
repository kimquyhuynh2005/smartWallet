import { CanActivate, ExecutionContext, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

export type OwnedModel = 'wallet' | 'transaction' | 'budget' | 'goal' | 'recurringRule' | 'notification';
export const OWNED_KEY = 'owned';
/** @Owned('wallet') -> the :id route param must belong to the JWT user, otherwise 404 (never 403, never leak existence). */
export const Owned = (model: OwnedModel, param = 'id') => SetMetadata(OWNED_KEY, { model, param });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const meta = this.reflector.get<{ model: OwnedModel; param: string } | undefined>(OWNED_KEY, ctx.getHandler());
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest();
    const id = req.params?.[meta.param];
    const notFound = new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found' });
    if (!req.user || typeof id !== 'string' || !UUID.test(id)) throw notFound;
    const delegate = (this.prisma as any)[meta.model]; // model names are a closed union (OwnedModel), never user input
    const row = await delegate.findFirst({ where: { id, userId: req.user.id, deletedAt: null }, select: { id: true } });
    if (!row) throw notFound;
    return true;
  }
}

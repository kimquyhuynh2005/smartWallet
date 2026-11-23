import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { WS_NAMESPACE } from '@smartwallet/shared';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/** What the rest of the app depends on: "tell this user something now". The Socket.IO gateway is one implementation. */
export abstract class RealtimePublisher {
  abstract emit(userId: string, event: string, payload: unknown): void;
}

export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Socket.IO namespace /ws. The JWT is checked once, on connect (handshake auth { token }, or an Authorization: Bearer header);
 * a valid user is placed in room user:{id}. Server -> client events only: notification:new and budget:updated.
 */
@Injectable()
@WebSocketGateway({ namespace: WS_NAMESPACE, cors: { origin: process.env.APP_URL, credentials: true } })
export class RealtimeGateway extends RealtimePublisher implements OnGatewayInit, OnGatewayConnection {
  private log = new Logger('Realtime');
  @WebSocketServer() server!: Namespace;

  constructor(private jwt: JwtService, private prisma: PrismaService) {
    super();
  }

  afterInit(ns: Namespace) {
    ns.use(async (socket: Socket, next) => {
      try {
        const raw = (socket.handshake.auth?.token as string | undefined) ?? String(socket.handshake.headers.authorization ?? '').replace(/^Bearer /, '');
        const payload: { sub: string } = await this.jwt.verifyAsync(raw);
        // same rule as the HTTP guard: deleted or locked users are refused immediately
        const u = await this.prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null }, select: { id: true, status: true } });
        if (!u || u.status !== 'ACTIVE') throw new Error('inactive');
        socket.data.userId = u.id;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(socket: Socket) {
    if (socket.data.userId) void socket.join(userRoom(socket.data.userId));
  }

  emit(userId: string, event: string, payload: unknown) {
    try {
      this.server?.to(userRoom(userId)).emit(event, payload);
    } catch (e) {
      this.log.error(`emit ${event} failed: ${(e as Error).message}`); // realtime is best effort: the notification is already stored
    }
  }
}

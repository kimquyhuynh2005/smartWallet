import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/** With several API instances, a socket connected to instance B must still receive events emitted by instance A: fan out through Redis. */
export class RedisIoAdapter extends IoAdapter {
  private ctor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(app: INestApplication) {
    super(app);
  }

  connect() {
    const pub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    this.ctor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: any) {
    const server = super.createIOServer(port, options);
    if (this.ctor) server.adapter(this.ctor);
    return server;
  }

  dispose() {
    this.clients.forEach((c) => c.disconnect());
    return super.dispose?.() as any;
  }
}

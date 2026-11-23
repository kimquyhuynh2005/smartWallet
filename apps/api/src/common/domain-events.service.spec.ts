import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvents } from './domain-events.service';

describe('DomainEvents', () => {
  it('awaits async listeners before resolving', async () => {
    const emitter = new EventEmitter2();
    const seen: string[] = [];
    emitter.on('x', async () => { await new Promise((r) => setTimeout(r, 10)); seen.push('listener'); });
    await new DomainEvents(emitter).publish('x', {});
    expect(seen).toEqual(['listener']);
  });
  it('returns what each listener returned (the alert engine hands back triggeredAlerts this way)', async () => {
    const emitter = new EventEmitter2();
    emitter.on('x', () => ({ triggeredAlerts: [1] }));
    emitter.on('x', () => undefined);
    expect(await new DomainEvents(emitter).publish('x', {})).toEqual([{ triggeredAlerts: [1] }, undefined]);
  });
  it('a throwing listener never fails the (already committed) write', async () => {
    const emitter = new EventEmitter2();
    emitter.on('x', () => { throw new Error('listener bug'); });
    await expect(new DomainEvents(emitter).publish('x', {})).resolves.toEqual([]);
  });
});

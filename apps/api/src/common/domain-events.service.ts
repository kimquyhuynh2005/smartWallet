import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Awaits listeners (so the API response reflects their side effects), but a failing listener never fails the already-committed write. */
@Injectable()
export class DomainEvents {
  private log = new Logger('DomainEvents');
  constructor(private emitter: EventEmitter2) {}

  /** Resolves with what each listener returned (e.g. the alert engine returns the alerts it triggered); [] if a listener failed. */
  async publish<T extends object>(name: string, payload: T): Promise<any[]> {
    try {
      return await this.emitter.emitAsync(name, payload);
    } catch (e) {
      this.log.error(`listener for ${name} failed: ${(e as Error).message}`);
      return [];
    }
  }
}

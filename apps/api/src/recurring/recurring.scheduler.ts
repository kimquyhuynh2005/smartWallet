import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { connectionFromEnv } from '../jobs/connection';
import { RecurringService } from './recurring.service';

export const RECURRING_QUEUE = 'recurring';
const SCHEDULER_ID = 'generate-due-transactions';

/**
 * TXN-05: a BullMQ repeatable job scheduler ("every N ms") plus the worker that runs it.
 * The scheduler id is fixed, so every API instance upserts the SAME schedule: there is one repeating job, not one per instance.
 * Disabled with RECURRING_WORKER=off, and not auto-started under NODE_ENV=test (tests call start() explicitly).
 */
@Injectable()
export class RecurringScheduler implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('RecurringScheduler');
  queue?: Queue;
  private worker?: Worker;
  private events?: QueueEvents;

  constructor(private recurring: RecurringService) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.RECURRING_WORKER === 'off') return;
    await this.start();
  }

  async start(opts: { prefix?: string; everyMs?: number } = {}) {
    if (this.queue) return;
    const connection = connectionFromEnv();
    const prefix = opts.prefix ?? process.env.BULL_PREFIX ?? 'sw';
    this.queue = new Queue(RECURRING_QUEUE, { connection, prefix });
    this.events = new QueueEvents(RECURRING_QUEUE, { connection, prefix });
    this.worker = new Worker(RECURRING_QUEUE, async () => this.recurring.generateDue(), { connection, prefix, concurrency: 1 });
    this.worker.on('failed', (job, err) => this.log.error(`job ${job?.id} failed: ${err.message}`));
    await this.events.waitUntilReady();
    await this.queue.upsertJobScheduler(SCHEDULER_ID, { every: opts.everyMs ?? Number(process.env.RECURRING_INTERVAL_MS ?? 60_000) }, { name: 'generate-due', data: {} });
    this.log.log('recurring generator scheduled');
  }

  /** Enqueue one run now and wait for it (tests, admin tooling). */
  async runNow(): Promise<{ rules: number; transactions: number }> {
    const job = await this.queue!.add('generate-due', {});
    return job.waitUntilFinished(this.events!);
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.worker?.close(), this.events?.close(), this.queue?.close()]);
    this.queue = undefined;
  }
}

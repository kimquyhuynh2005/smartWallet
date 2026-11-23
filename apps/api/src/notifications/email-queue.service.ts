import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { bullPrefix, connectionFromEnv, workersEnabled } from '../jobs/connection';
import { MailMessage, MailService } from '../mail/mail.service';

export const EMAIL_QUEUE = 'email';

/** Emails are never sent inline: they go on a BullMQ queue (retries with backoff) and a worker hands them to the MailService (console / SES). */
@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('EmailQueue');
  private queue?: Queue;
  private worker?: Worker;

  constructor(private mail: MailService) {}

  /** producer side; created lazily so tests and the OpenAPI generator never open connections they do not use */
  get q(): Queue {
    return (this.queue ??= new Queue(EMAIL_QUEUE, { connection: connectionFromEnv(), prefix: bullPrefix() }));
  }

  /** `jobKey` makes the job idempotent: the same alert / summary can never be queued twice while its job exists. */
  async enqueue(msg: MailMessage, jobKey?: string) {
    await this.q.add('send', msg, {
      ...(jobKey ? { jobId: jobKey.replace(/:/g, '_') } : {}), // BullMQ forbids ':' in custom ids
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400 },
    });
  }

  onModuleInit() {
    if (workersEnabled()) this.startWorker();
  }

  startWorker(prefix = bullPrefix()) {
    if (this.worker) return;
    this.worker = new Worker(EMAIL_QUEUE, async (job) => this.mail.send(job.data as MailMessage), { connection: connectionFromEnv(), prefix, concurrency: 5 });
    this.worker.on('failed', (job, err) => this.log.error(`email job ${job?.id} failed: ${err.message}`));
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.worker?.close(), this.queue?.close()]);
    this.worker = undefined;
    this.queue = undefined;
  }
}

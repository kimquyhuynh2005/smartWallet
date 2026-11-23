import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DEFAULT_TIMEZONE } from '@smartwallet/shared';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { bullPrefix, connectionFromEnv, workersEnabled } from '../jobs/connection';
import { GoalCheckService } from './goal-check.service';
import { WeeklySummaryService } from './weekly-summary.service';

export const ALERT_JOBS_QUEUE = 'alert-jobs';
export const JOBS = { weekly: 'weekly-summary', goals: 'daily-goal-check' } as const;

/** ALR-03 cron jobs as BullMQ job schedulers in Vietnam time. Fixed scheduler ids: N API instances still produce ONE schedule. */
@Injectable()
export class AlertJobsScheduler implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('AlertJobs');
  queue?: Queue;
  private worker?: Worker;
  private events?: QueueEvents;

  constructor(private weekly: WeeklySummaryService, private goals: GoalCheckService) {}

  async onModuleInit() {
    if (workersEnabled()) await this.start();
  }

  async start(opts: { prefix?: string } = {}) {
    if (this.queue) return;
    const connection = connectionFromEnv();
    const prefix = opts.prefix ?? bullPrefix();
    this.queue = new Queue(ALERT_JOBS_QUEUE, { connection, prefix });
    this.events = new QueueEvents(ALERT_JOBS_QUEUE, { connection, prefix });
    this.worker = new Worker(
      ALERT_JOBS_QUEUE,
      async (job) => (job.name === JOBS.weekly ? this.weekly.run() : job.name === JOBS.goals ? this.goals.run() : null),
      { connection, prefix, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => this.log.error(`job ${job?.name} failed: ${err.message}`));
    await this.events.waitUntilReady();
    await this.queue.upsertJobScheduler(JOBS.weekly, { pattern: process.env.WEEKLY_SUMMARY_CRON ?? '0 9 * * 1', tz: DEFAULT_TIMEZONE }, { name: JOBS.weekly, data: {} });
    await this.queue.upsertJobScheduler(JOBS.goals, { pattern: process.env.GOAL_CHECK_CRON ?? '0 8 * * *', tz: DEFAULT_TIMEZONE }, { name: JOBS.goals, data: {} });
    this.log.log('weekly summary + daily goal check scheduled');
  }

  /** enqueue one run now and wait for the worker (tests, ops) */
  async runNow(name: (typeof JOBS)[keyof typeof JOBS]) {
    const job = await this.queue!.add(name, {});
    return job.waitUntilFinished(this.events!);
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.worker?.close(), this.events?.close(), this.queue?.close()]);
    this.queue = undefined;
  }
}

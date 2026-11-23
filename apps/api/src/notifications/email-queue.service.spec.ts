const add = jest.fn();
const close = jest.fn();
const workerCtor = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, close })),
  Worker: jest.fn().mockImplementation((...a: unknown[]) => { workerCtor(...a); return { on: jest.fn(), close }; }),
}));

import { EmailQueueService } from './email-queue.service';

beforeEach(() => { add.mockReset(); close.mockReset(); workerCtor.mockReset(); });

describe('ALR-02 EmailQueueService (BullMQ)', () => {
  const mail: any = { send: jest.fn() };

  it('queues the email with retries + exponential backoff instead of sending it inline', async () => {
    await new EmailQueueService(mail).enqueue({ to: 'a@b.com', subject: 's', text: 't' });
    expect(mail.send).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith('send', { to: 'a@b.com', subject: 's', text: 't' }, expect.objectContaining({ attempts: 5, backoff: { type: 'exponential', delay: 5000 } }));
  });
  it('a job key makes the job idempotent (and BullMQ-legal: no colons)', async () => {
    await new EmailQueueService(mail).enqueue({ to: 'a@b.com', subject: 's', text: 't' }, 'email:budget:abc:80');
    expect(add.mock.calls[0][2].jobId).toBe('email_budget_abc_80');
  });
  it('without a job key no id is forced', async () => {
    await new EmailQueueService(mail).enqueue({ to: 'a@b.com', subject: 's', text: 't' });
    expect(add.mock.calls[0][2]).not.toHaveProperty('jobId');
  });
  it('the worker hands each job to the MailService (console locally, SES in production)', async () => {
    const svc = new EmailQueueService(mail);
    svc.startWorker('p');
    svc.startWorker('p'); // idempotent
    expect(workerCtor).toHaveBeenCalledTimes(1);
    const [name, handler, opts] = workerCtor.mock.calls[0];
    expect(name).toBe('email');
    expect(opts.prefix).toBe('p');
    await handler({ data: { to: 'x@y.z', subject: 'S', text: 'T' } });
    expect(mail.send).toHaveBeenCalledWith({ to: 'x@y.z', subject: 'S', text: 'T' });
  });
  it('does not auto-start a worker under NODE_ENV=test, and closes its connections on shutdown', async () => {
    const svc = new EmailQueueService(mail);
    svc.onModuleInit();
    expect(workerCtor).not.toHaveBeenCalled();
    svc.startWorker();
    await svc.enqueue({ to: 'a@b.com', subject: 's', text: 't' });
    await svc.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(2);
  });
});

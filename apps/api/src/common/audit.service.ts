import { Injectable, Logger } from '@nestjs/common';

/**
 * Audit trail for logins, password changes and admin actions.
 * NOTE: the 14-table schema has no audit table, so events go to structured logs (ship them to CloudWatch/ELK).
 * Persisting needs a 15th table `audit_logs`: open question for the product owner.
 */
@Injectable()
export class AuditService {
  private log = new Logger('AUDIT');

  record(action: string, actorId: string | null, meta: Record<string, unknown> = {}) {
    if (process.env.NODE_ENV !== 'test') this.log.log(JSON.stringify({ action, actorId, ...meta, at: new Date().toISOString() }));
  }
}

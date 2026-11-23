import { Injectable, Logger } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Mail transport interface (abstract class so it can be a Nest DI token). */
export abstract class MailService {
  abstract send(msg: MailMessage): Promise<void>;
}

/** Local dev: prints the email (including verification/reset links) to the API log. */
@Injectable()
export class ConsoleMailService extends MailService {
  private log = new Logger('Mail');
  async send(msg: MailMessage) {
    this.log.log(`\n--- EMAIL to ${msg.to} ---\nSubject: ${msg.subject}\n${msg.text}\n--------------------------`);
  }
}

/** Production: AWS SES. Credentials via the default AWS provider chain (IAM role). */
@Injectable()
export class SesMailService extends MailService {
  private ses = new SESClient({ region: process.env.AWS_REGION ?? process.env.S3_REGION ?? 'ap-southeast-1' });
  async send(msg: MailMessage) {
    await this.ses.send(
      new SendEmailCommand({
        Source: process.env.MAIL_FROM!,
        Destination: { ToAddresses: [msg.to] },
        Message: {
          Subject: { Data: msg.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: msg.text, Charset: 'UTF-8' }, ...(msg.html ? { Html: { Data: msg.html, Charset: 'UTF-8' } } : {}) },
        },
      }),
    );
  }
}

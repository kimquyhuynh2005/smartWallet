import { Global, Module } from '@nestjs/common';
import { ConsoleMailService, MailService, SesMailService } from './mail.service';

@Global()
@Module({
  providers: [{ provide: MailService, useFactory: () => (process.env.MAIL_TRANSPORT === 'ses' ? new SesMailService() : new ConsoleMailService()) }],
  exports: [MailService],
})
export class MailModule {}

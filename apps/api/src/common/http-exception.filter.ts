import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;
    if (e instanceof HttpException) {
      status = e.getStatus();
      const r: any = e.getResponse();
      code = r?.code ?? HttpStatus[status] ?? 'ERROR';
      message = typeof r === 'string' ? r : (r?.message ?? e.message);
      details = r?.details;
    } else {
      console.error(e);
    }
    res.status(status).json({ error: { code, message, details } });
  }
}

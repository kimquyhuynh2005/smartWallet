import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { ResponseInterceptor } from './common/response.interceptor';

// Money is BIGINT in DB; serialised as a JSON integer (VND never exceeds 2^53).
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

/** Shared by main.ts and integration tests so tests exercise the real HTTP pipeline. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: process.env.APP_URL, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  return app;
}

/** The OpenAPI document served at /api/docs and committed as apps/api/openapi.json (npm run openapi). */
export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SmartWallet API')
    .setDescription('Success: `{ data, meta? }`. Error: `{ error: { code, message, details } }`. Money is integer VND. Dates are ISO 8601.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

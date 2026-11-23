/* Regenerates apps/api/openapi.json from the real controllers: `npm run openapi -w @smartwallet/api`.
 * Needs DATABASE_URL + REDIS_URL + JWT secrets (the app is booted, but nothing listens). */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument, configureApp } from '../src/app.setup';

process.env.RECURRING_WORKER = 'off';
process.env.JWT_ACCESS_SECRET ??= 'openapi';
process.env.JWT_ACTION_SECRET ??= 'openapi';

async function main() {
  const app = configureApp(await NestFactory.create(AppModule, { logger: false }));
  await app.init();
  writeFileSync(join(__dirname, '..', 'openapi.json'), JSON.stringify(buildOpenApiDocument(app), null, 2) + '\n');
  await app.close();
  console.log('openapi.json written');
}
main().catch((e) => { console.error(e); process.exit(1); });

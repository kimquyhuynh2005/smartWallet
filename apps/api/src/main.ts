import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp } from './app.setup';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  if (process.env.WS_REDIS_ADAPTER !== 'off') {
    // several API instances: a socket on instance B must still get events emitted on instance A
    const adapter = new RedisIoAdapter(app);
    adapter.connect();
    app.useWebSocketAdapter(adapter);
  }
  SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app));
  await app.listen(Number(process.env.API_PORT ?? 3000), '0.0.0.0');
}
bootstrap();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  const adapter = new ExpressAdapter();
  const express = adapter.getInstance();
  let applicationReady = false;

  // A hospedagem gerenciada exige que a porta seja aberta em até três segundos.
  // O bootstrap completo do Nest (módulos, validação e Swagger) pode ultrapassar
  // esse limite em uma inicialização a frio. O servidor começa a escutar
  // imediatamente e encaminha as requisições ao Nest assim que ele estiver pronto.
  express.use((request: { path?: string }, response: any, next: () => void) => {
    if (applicationReady) {
      next();
      return;
    }

    if (request.path === '/api/v1/health/live') {
      response.status(200).json({
        status: 'ok',
        service: 'gestao-de-predios-api',
        liveness: 'starting',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    response.status(503).json({
      status: 'starting',
      service: 'gestao-de-predios-api',
      message: 'Aplicação em inicialização.',
    });
  });

  const server = createServer(express);
  server.listen(port, '0.0.0.0');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, adapter, {
    rawBody: true,
  });
  app.useBodyParser('json', { limit: `${Number(process.env.MAX_JSON_MB ?? 20)}mb` });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gestão de Prédios API')
    .setDescription('API multi-tenant para manutenção predial e gestão de ordens de serviço.')
    .setVersion('0.20.0')
    .addCookieAuth('gp_access')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  app.enableShutdownHooks();
  await app.init();
  applicationReady = true;
}

void bootstrap().catch((error: unknown) => {
  console.error('Falha ao inicializar a API.', error);
});

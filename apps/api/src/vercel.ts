import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createCorsOriginDelegate } from './config/cors-origins';
import { initSentryFromEnv } from './config/sentry';

let cachedApp: express.Express | undefined;
const logger = new Logger('VercelHandler');

async function bootstrap(): Promise<express.Express> {
  initSentryFromEnv();
  const server = express();
  server.set('trust proxy', 1);
  /**
   * No Vercel (ExpressAdapter + função única), `app.enableCors()` não responde ao preflight OPTIONS
   * antes do roteador — o browser bloqueia o fetch cross-origin. Registrar `cors` no Express primeiro.
   * FRONTEND_URL vem do mesmo env que o ConfigModule (variáveis do projeto na Vercel).
   */
  server.use(cookieParser());
  server.use(
    cors({
      origin: createCorsOriginDelegate(process.env.FRONTEND_URL, 'http://localhost:5173'),
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
      optionsSuccessStatus: 204,
    }),
  );

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api');

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger pesa memória e pode falhar em serverless; em produção na Vercel não é necessário para o app.
  if (process.env.VERCEL !== '1') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PainelGRID API')
      .setDescription('API de gestao de leads, eventos e vendas - EverSync')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addTag('auth', 'Autenticacao e autorizacao')
      .addTag('users', 'Gestao de usuarios')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.init();
  return server;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    if (!cachedApp) {
      cachedApp = await bootstrap();
    }
    cachedApp(req, res);
  } catch (err) {
    logger.error(
      '[vercel] handler/bootstrap',
      err instanceof Error ? err.stack : JSON.stringify(err),
    );
    if (res.headersSent) {
      return;
    }
    const message = err instanceof Error ? err.message : 'Erro interno';
    res.status(500).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        statusCode: 500,
        error: 'BootstrapError',
        message,
        hint: 'Confira variaveis na Vercel (DATABASE_URL, JWT_*, FRONTEND_URL) e os logs da funcao.',
      }),
    );
  }
}

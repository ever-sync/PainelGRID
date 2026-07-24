import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JsonLogger } from './common/logger/json-logger.service';
import { createCorsOriginDelegate } from './config/cors-origins';
import { initSentryFromEnv } from './config/sentry';

process.on('unhandledRejection', (reason: any) => {
  if (reason?.code === 'ECONNREFUSED' || reason?.errors?.some((e: any) => e?.code === 'ECONNREFUSED')) {
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

function shouldEnableSwagger(configService: ConfigService): boolean {
  const nodeEnv = configService.get<string>('NODE_ENV', 'development').toLowerCase();
  if (nodeEnv !== 'production') {
    return true;
  }
  const flag = configService.get<string>('ENABLE_SWAGGER')?.trim().toLowerCase();
  return flag === 'true' || flag === '1';
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  initSentryFromEnv();
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: new JsonLogger('App'),
  });

  const expressApp = app.getHttpAdapter().getInstance();
  if (typeof expressApp?.set === 'function') {
    expressApp.set('trust proxy', 1);
  }

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", 'https:', 'wss:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  // Acomoda payloads com data URLs de imagem (ex.: logo de time em base64).
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors({
    origin: createCorsOriginDelegate(
      configService.get<string>('FRONTEND_URL'),
      'http://localhost:5173',
    ),
    credentials: true,
  });

  if (shouldEnableSwagger(configService)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PainelGRID API')
      .setDescription('API de gestao de leads, eventos e vendas - EverSync')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addTag('auth', 'Autenticacao e autorizacao')
      .addTag('users', 'Gestao de usuarios')
      .addTag('clients', 'Gestao de clientes/empresas')
      .addTag('leads', 'Gestao de leads')
      .addTag('crm', 'Pipeline CRM')
      .addTag('events', 'Gestao de eventos')
      .addTag('campaigns', 'Campanhas de distribuicao')
      .addTag('chat', 'Conversas e mensagens')
      .addTag('courses', 'Cursos e treinamentos')
      .addTag('webhooks', 'Webhooks Facebook/WhatsApp/n8n')
      .addTag('dashboard', 'Metricas e dashboards')
      .addTag('health', 'Health check de infraestrutura')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    logger.log(`Swagger disponivel em http://localhost:${port}/docs`);
  } else {
    logger.log('Swagger desativado em producao (defina ENABLE_SWAGGER=true para ativar)');
  }

  await app.listen(port);
  logger.log(`PainelGRID API rodando em http://localhost:${port}/${apiPrefix}`);
}

bootstrap();

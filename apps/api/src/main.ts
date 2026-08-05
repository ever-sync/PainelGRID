import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";
import { JsonLogger } from "./common/logger/json-logger.service";
import { createCorsOriginDelegate } from "./config/cors-origins";
import { initSentryFromEnv } from "./config/sentry";

process.on("unhandledRejection", (reason: unknown) => {
  const details =
    reason && typeof reason === "object"
      ? (reason as {
          code?: unknown;
          errors?: Array<{ code?: unknown }>;
          name?: string;
          message?: string;
        })
      : null;
  if (
    details?.code === "ECONNREFUSED" ||
    details?.name === "ConnectionClosedError" ||
    details?.message?.includes("Connection is closed") ||
    details?.errors?.some((error) => error.code === "ECONNREFUSED")
  ) {
    return;
  }
  console.error("Unhandled promise rejection", reason);
});

function shouldEnableSwagger(configService: ConfigService): boolean {
  const nodeEnv = configService
    .get<string>("NODE_ENV", "development")
    .toLowerCase();
  if (nodeEnv !== "production") {
    return true;
  }
  const flag = configService
    .get<string>("ENABLE_SWAGGER")
    ?.trim()
    .toLowerCase();
  return flag === "true" || flag === "1";
}

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  initSentryFromEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: new JsonLogger("App"),
  });

  const expressApp = app.getHttpAdapter().getInstance();
  if (typeof expressApp?.set === "function") {
    expressApp.set("trust proxy", 1);
  }

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 3000);
  const apiPrefix = configService.get<string>("API_PREFIX", "api");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://api.gpdevendas.app",
            "https://*.railway.app",
            "https://api.qrserver.com",
            "https://raw.githubusercontent.com",
            "https://images.unsplash.com",
          ],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          mediaSrc: [
            "'self'",
            "blob:",
            "https://api.gpdevendas.app",
            "https://*.railway.app",
          ],
          connectSrc: [
            "'self'",
            "https://api.gpdevendas.app",
            "wss://api.gpdevendas.app",
            "https://*.railway.app",
            "wss://*.railway.app",
            "https://api.qrserver.com",
            "https://parallelum.com.br",
            "https://fipe.parallelum.com.br",
          ],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: {
        policy: "strict-origin-when-cross-origin",
      },
      frameguard: {
        action: "deny",
      },
      noSniff: true,
    }),
  );
  app.use(cookieParser());
  app.use(
    compression({
      threshold: 1_024,
    }),
  );
  // Acomoda payloads com data URLs de imagem (ex.: logo de time em base64).
  //
  // `useBodyParser` e nao `app.use(json())`: com `rawBody: true`, o Nest aplica
  // os parsers dele no init(), DEPOIS dos app.use(). Um json() registrado a mao
  // roda primeiro, consome o stream e marca req._body — o parser do Nest entao
  // pula e `req.rawBody` fica vazio para sempre.
  //
  // Consequencia real: o webhook da Meta exige rawBody para validar a assinatura,
  // e o guard rejeitava TODO POST com 413. As mensagens do WhatsApp chegavam e
  // eram descartadas.
  app.useBodyParser("json", { limit: "2mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "2mb" });

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
  app.enableCors({
    origin: createCorsOriginDelegate(
      configService.get<string>("FRONTEND_URL"),
      "http://localhost:5173",
    ),
    credentials: true,
  });

  if (shouldEnableSwagger(configService)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("PainelGRID API")
      .setDescription("API de gestao de leads, eventos e vendas - EverSync")
      .setVersion("0.1.0")
      .addBearerAuth()
      .addTag("auth", "Autenticacao e autorizacao")
      .addTag("users", "Gestao de usuarios")
      .addTag("clients", "Gestao de clientes/empresas")
      .addTag("leads", "Gestao de leads")
      .addTag("crm", "Pipeline CRM")
      .addTag("events", "Gestao de eventos")
      .addTag("campaigns", "Campanhas de distribuicao")
      .addTag("chat", "Conversas e mensagens")
      .addTag("courses", "Cursos e treinamentos")
      .addTag("webhooks", "Webhooks Facebook/WhatsApp/n8n")
      .addTag("dashboard", "Metricas e dashboards")
      .addTag("health", "Health check de infraestrutura")
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
    logger.log(`Swagger disponivel em http://localhost:${port}/docs`);
  } else {
    logger.log(
      "Swagger desativado em producao (defina ENABLE_SWAGGER=true para ativar)",
    );
  }

  await app.listen(port);
  logger.log(`PainelGRID API rodando em http://localhost:${port}/${apiPrefix}`);
}

bootstrap();

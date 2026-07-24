import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function getPrismaDatabaseUrl() {
  // Vercel/Supabase integrations may expose POSTGRES_URL instead of DATABASE_URL.
  const rawUrl = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'postgresql:' || url.protocol === 'postgres:') {
      const explicitConnectionLimit = process.env.PRISMA_CONNECTION_LIMIT?.trim();
      if (explicitConnectionLimit && !url.searchParams.has('connection_limit')) {
        url.searchParams.set('connection_limit', explicitConnectionLimit);
      } else if (!url.searchParams.has('connection_limit')) {
        url.searchParams.set('connection_limit', '1');
      }

      const explicitPoolTimeout = process.env.PRISMA_POOL_TIMEOUT?.trim();
      if (explicitPoolTimeout && !url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', explicitPoolTimeout);
      } else if (!url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', '20');
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const databaseUrl = getPrismaDatabaseUrl();

    super({
      datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });
  }

  async onModuleInit() {
    // Em Vercel/serverless, evitar conectar agressivamente no boot reduz pico de conexões simultâneas.
    if (process.env.VERCEL === '1' || process.env.SERVERLESS === 'true') {
      this.logger.log('PrismaService inicializado (lazy connect em serverless)');
      return;
    }

    // Em ambientes serverless (Vercel), $connect() com timeout evita travar
    // a inicialização da função quando o banco demora a responder.
    await Promise.race([
      this.$connect(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Prisma $connect timeout (8s)')), 8000),
      ),
    ]).catch((err: Error) => {
      this.logger.warn(
        `Conexão inicial com o banco falhou: ${err.message}. Prisma tentará reconectar na primeira query.`,
      );
    });
    this.logger.log('PrismaService inicializado');
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => undefined);
    this.logger.log('Desconectado do PostgreSQL');
  }
}

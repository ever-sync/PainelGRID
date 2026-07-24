import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InMemoryRedisClient, isLocalhostRedisUrl, isUnreachableRedisUrl } from './in-memory-redis.client';

export class ResilientRedisClient {
  private readonly fallback = new InMemoryRedisClient();
  private isFallbackActive = false;

  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {
    this.redis.on('error', (err) => {
      if (!this.isFallbackActive) {
        this.logger.warn(`Conexão Redis falhou (${err.message}). Ativando fallback em memória.`);
        this.isFallbackActive = true;
      }
    });
    this.redis.on('connect', () => {
      if (this.isFallbackActive) {
        this.logger.log('Conexão Redis restabelecida. Desativando fallback em memória.');
        this.isFallbackActive = false;
      }
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.isFallbackActive) {
      return this.fallback.get(key);
    }
    try {
      return await this.redis.get(key);
    } catch (err: any) {
      this.isFallbackActive = true;
      this.logger.error(`Erro ao ler do Redis, usando fallback: ${err.message}`);
      return this.fallback.get(key);
    }
  }

  async set(key: string, value: string, mode?: 'EX', ttlSeconds?: number): Promise<'OK'> {
    if (this.isFallbackActive) {
      return this.fallback.set(key, value, mode, ttlSeconds);
    }
    try {
      if (mode === 'EX' && typeof ttlSeconds === 'number') {
        return (await this.redis.set(key, value, 'EX', ttlSeconds)) as 'OK';
      }
      return (await this.redis.set(key, value)) as 'OK';
    } catch (err: any) {
      this.isFallbackActive = true;
      this.logger.error(`Erro ao escrever no Redis, usando fallback: ${err.message}`);
      return this.fallback.set(key, value, mode, ttlSeconds);
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (this.isFallbackActive) {
      return this.fallback.del(...keys);
    }
    try {
      return await this.redis.del(...keys);
    } catch (err: any) {
      this.isFallbackActive = true;
      this.logger.error(`Erro ao deletar do Redis, usando fallback: ${err.message}`);
      return this.fallback.del(...keys);
    }
  }

  async scan(
    cursor: string | number,
    ...args: Array<string | number>
  ): Promise<[string, string[]]> {
    if (this.isFallbackActive) {
      return this.fallback.scan(cursor, ...args);
    }
    try {
      return await (this.redis.scan as any)(cursor, ...args);
    } catch (err: any) {
      this.isFallbackActive = true;
      this.logger.error(`Erro ao escanear Redis, usando fallback: ${err.message}`);
      return this.fallback.scan(cursor, ...args);
    }
  }

  on(event: string, fn?: (...args: any[]) => void): this {
    if (fn) {
      this.redis.on(event, fn);
    }
    return this;
  }

  async quit(): Promise<'OK'> {
    try {
      await this.redis.quit();
    } catch {
      // ignore
    }
    return this.fallback.quit();
  }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis | InMemoryRedisClient | ResilientRedisClient;

  constructor(private readonly configService: ConfigService) {
    const isVercel = process.env.VERCEL === '1';
    const raw = this.configService.get<string>('REDIS_URL')?.trim();
    const localDefault = 'redis://localhost:6379';

    let url = raw || (!isVercel ? localDefault : '');

    if (url && (isVercel && isLocalhostRedisUrl(url) || isUnreachableRedisUrl(url))) {
      const reason = isUnreachableRedisUrl(url)
        ? 'REDIS_URL aponta para host inacessível localmente (*.railway.internal) — usando Redis em memória.'
        : 'REDIS_URL aponta para localhost no Vercel — usando Redis em memória.';
      this.logger.warn(reason);
      url = '';
    }

    if (!url) {
      if (isVercel) {
        this.logger.warn(
          'Redis em memoria no serverless: refresh tokens e fluxo Meta OAuth podem resetar entre cold starts. ' +
            'Para producao, use Upstash Redis e defina REDIS_URL.',
        );
      }
      this.client = new InMemoryRedisClient();
      return;
    }

    const redisInstance = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    redisInstance.on('connect', () => {
      this.logger.log('Conectado ao Redis');
    });

    redisInstance.on('error', (err: Error) => {
      this.logger.error(`Erro na conexão Redis: ${err.message}`);
    });

    this.client = new ResilientRedisClient(redisInstance, this.logger);
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Desconectado do Redis');
  }
}

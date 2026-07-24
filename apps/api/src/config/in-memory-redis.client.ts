/**
 * Subconjunto da API do ioredis usado por Auth + Meta (get / set EX / del / scan / quit / on).
 * Para Vercel sem REDIS_URL ou com localhost — evita 500 no login.
 */
export class InMemoryRedisClient {
  private readonly store = new Map<string, { value: string; expireAt: number | null }>();

  on(_event: string, _fn?: (...args: unknown[]) => void): this {
    return this;
  }

  async get(key: string): Promise<string | null> {
    const row = this.store.get(key);
    if (!row) {
      return null;
    }
    if (row.expireAt !== null && Date.now() > row.expireAt) {
      this.store.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, mode?: 'EX', ttlSeconds?: number): Promise<'OK'> {
    let expireAt: number | null = null;
    if (mode === 'EX' && typeof ttlSeconds === 'number' && ttlSeconds > 0) {
      expireAt = Date.now() + ttlSeconds * 1000;
    }
    this.store.set(key, { value, expireAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        removed += 1;
      }
    }
    return removed;
  }

  async consumeTwoFactorChallenge(
    key: string,
    codeHash: string,
    maxAttempts: number,
  ): Promise<{ status: 'valid'; payload: string } | { status: 'invalid' | 'locked' | 'missing' }> {
    const row = this.store.get(key);
    if (!row || (row.expireAt !== null && Date.now() > row.expireAt)) {
      this.store.delete(key);
      return { status: 'missing' };
    }

    let data: { codeHash?: string; attempts?: number };
    try {
      data = JSON.parse(row.value) as { codeHash?: string; attempts?: number };
    } catch {
      this.store.delete(key);
      return { status: 'missing' };
    }

    if (data.codeHash === codeHash) {
      this.store.delete(key);
      return { status: 'valid', payload: row.value };
    }

    data.attempts = (data.attempts ?? 0) + 1;
    if (data.attempts >= maxAttempts) {
      this.store.delete(key);
      return { status: 'locked' };
    }
    this.store.set(key, { value: JSON.stringify(data), expireAt: row.expireAt });
    return { status: 'invalid' };
  }

  async scan(
    cursor: string | number,
    ...args: Array<string | number>
  ): Promise<[string, string[]]> {
    void cursor;

    const options = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
      const optionKey = String(args[index] ?? '').toUpperCase();
      const optionValue = args[index + 1];
      if (!optionKey || optionValue === undefined) {
        continue;
      }
      options.set(optionKey, String(optionValue));
    }

    const pattern = options.get('MATCH') ?? '*';
    const matcher = globToRegExp(pattern);
    const keys = Array.from(this.store.keys()).filter((key) => matcher.test(key));

    return ['0', keys];
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
}

function globToRegExp(pattern: string) {
  const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

export function isLocalhostRedisUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function isUnreachableRedisUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
    if (
      host.endsWith('.railway.internal') &&
      !process.env.RAILWAY_ENVIRONMENT &&
      !process.env.RAILWAY_STATIC_URL
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

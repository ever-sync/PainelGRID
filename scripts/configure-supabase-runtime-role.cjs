const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const ROLE = 'prisma_runtime';
const PROJECT_REF = 'mvngkthebsvsliocucuc';

function prisma(url) {
  return new PrismaClient({ datasources: { db: { url } } });
}

async function connectAdmin() {
  const urls = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean);
  let lastError;

  for (const url of urls) {
    const client = prisma(url);
    try {
      await client.$queryRawUnsafe('select 1');
      return client;
    } catch (error) {
      lastError = error;
      await client.$disconnect().catch(() => undefined);
    }
  }

  throw lastError ?? new Error('DIRECT_URL ou DATABASE_URL precisa estar configurada.');
}

async function validateRuntime(runtimeUrl) {
  let lastError;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const client = prisma(runtimeUrl);
    try {
      const [identity] = await client.$queryRawUnsafe(
        `select current_user,
                has_schema_privilege(current_user, 'public', 'USAGE') as schema_usage,
                (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl`,
      );
      await client.$queryRawUnsafe('select count(*)::bigint as clients from public.clients');
      await client.$disconnect();
      return identity;
    } catch (error) {
      lastError = error;
      await client.$disconnect().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw lastError;
}

async function disableRuntimeLogin() {
  const admin = await connectAdmin();
  try {
    await admin.$executeRawUnsafe(`alter role "${ROLE}" nologin`);
  } finally {
    await admin.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const password = crypto.randomBytes(32).toString('hex');
  const admin = await connectAdmin();

  try {
    const exists = await admin.$queryRawUnsafe(
      `select exists(select 1 from pg_roles where rolname = '${ROLE}') as exists`,
    );

    if (!exists[0].exists) {
      await admin.$executeRawUnsafe(
        `create role "${ROLE}" login bypassrls nosuperuser nocreatedb nocreaterole noreplication password '${password}'`,
      );
    } else {
      await admin.$executeRawUnsafe(
        `alter role "${ROLE}" with login bypassrls nocreatedb nocreaterole noreplication password '${password}'`,
      );
    }

    await admin.$executeRawUnsafe(`grant connect on database postgres to "${ROLE}"`);
    await admin.$executeRawUnsafe(`grant usage on schema public to "${ROLE}"`);
    await admin.$executeRawUnsafe(
      `grant select, insert, update, delete on all tables in schema public to "${ROLE}"`,
    );
    await admin.$executeRawUnsafe(
      `grant usage, select on all sequences in schema public to "${ROLE}"`,
    );
    await admin.$executeRawUnsafe(
      `alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to "${ROLE}"`,
    );
    await admin.$executeRawUnsafe(
      `alter default privileges for role postgres in schema public grant usage, select on sequences to "${ROLE}"`,
    );
    await admin.$executeRawUnsafe(
      `alter role "${ROLE}" set statement_timeout = '60s'`,
    );
    await admin.$executeRawUnsafe(
      `alter role "${ROLE}" set idle_in_transaction_session_timeout = '60s'`,
    );
    await admin.$executeRawUnsafe(`alter role "${ROLE}" set lock_timeout = '10s'`);
  } finally {
    await admin.$disconnect().catch(() => undefined);
  }

  const runtimeUrl = new URL(process.env.DATABASE_URL);
  if (runtimeUrl.hostname.endsWith('.pooler.supabase.com')) {
    runtimeUrl.username = `${ROLE}.${PROJECT_REF}`;
  } else {
    runtimeUrl.username = ROLE;
  }
  runtimeUrl.password = password;
  runtimeUrl.searchParams.set('sslmode', 'require');
  runtimeUrl.searchParams.set('connection_limit', '1');
  runtimeUrl.searchParams.set('pool_timeout', '20');

  const identity = await validateRuntime(runtimeUrl.toString());
  if (
    identity.current_user !== ROLE ||
    identity.schema_usage !== true ||
    identity.ssl !== true
  ) {
    throw new Error('A role de runtime não passou na validação de identidade, schema e TLS.');
  }

  const apiDir = path.join(process.cwd(), 'apps', 'api');
  const vercel = spawnSync(
    'npx',
    [
      'vercel@latest',
      'env',
      'add',
      'DATABASE_URL',
      'production',
      '--force',
      '--sensitive',
      '--yes',
    ],
    {
      cwd: apiDir,
      input: `${runtimeUrl.toString()}\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  if (vercel.status !== 0) {
    await disableRuntimeLogin();
    throw new Error(
      `Falha ao atualizar DATABASE_URL na Vercel: ${[
        vercel.stdout.trim(),
        vercel.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n')}`,
    );
  }

  console.log(
    JSON.stringify({
      role: ROLE,
      runtimeValidated: true,
      tls: true,
      vercelDatabaseUrlUpdated: true,
    }),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

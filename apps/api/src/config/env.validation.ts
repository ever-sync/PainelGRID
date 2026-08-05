import { getApiEnvFilePaths, mergeEnvFilesNestOrder } from "./env-paths";

type EnvironmentVariables = Record<string, string | undefined>;

const META_FILE_KEYS = [
  "META_APP_ID",
  "FACEBOOK_APP_ID",
  "META_APP_SECRET",
  "FACEBOOK_APP_SECRET",
] as const;

/**
 * O Nest faz merge `{ ...arquivo, ...process.env }`; variáveis vazias no shell (ex.: FACEBOOK_APP_ID=)
 * sobrescrevem o .env e quebram Meta. Recuperamos valores dos arquivos quando o merge veio vazio.
 */
function hydrateMetaKeysFromEnvFiles(
  env: EnvironmentVariables,
): EnvironmentVariables {
  const fromFiles = mergeEnvFilesNestOrder(getApiEnvFilePaths());
  const next: EnvironmentVariables = { ...env };
  for (const key of META_FILE_KEYS) {
    if (!next[key]?.trim() && fromFiles[key]?.trim()) {
      next[key] = fromFiles[key]!.trim();
    }
  }
  return next;
}

function requireString(env: EnvironmentVariables, key: string) {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${key}`);
  }

  return value;
}

function validateUrl(value: string, key: string, protocols: string[]) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Variavel de ambiente invalida: ${key}`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`Protocolo invalido para ${key}: ${parsed.protocol}`);
  }
}

/** FRONTEND_URL aceita varias origens separadas por virgula, incluindo o scheme nativo do app iOS (Capacitor). */
function validateOptionalHttpOriginList(value: string, key: string) {
  for (const part of value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    validateUrl(part, key, ["http:", "https:", "capacitor:"]);
  }
}

function validateDuration(value: string, key: string) {
  if (!/^\d+[smhd]$/.test(value.trim().toLowerCase())) {
    throw new Error(
      `Duracao invalida para ${key}. Use formatos como 15m, 7d ou 1h.`,
    );
  }
}

function validateMinLength(value: string, key: string, min: number) {
  if (value.length < min) {
    throw new Error(`${key} deve ter no minimo ${min} caracteres.`);
  }
}

export function validateEnvironment(raw: EnvironmentVariables) {
  const env = hydrateMetaKeysFromEnvFiles(raw);
  const databaseUrl =
    env.DATABASE_URL?.trim() ||
    env.POSTGRES_URL?.trim() ||
    requireString(env, "DATABASE_URL");
  const isVercel = env.VERCEL === "1";
  const redisUrlRaw = env.REDIS_URL?.trim();
  if (redisUrlRaw) {
    validateUrl(redisUrlRaw, "REDIS_URL", ["redis:", "rediss:"]);
  } else if (!isVercel) {
    requireString(env, "REDIS_URL");
  }
  const jwtSecret = requireString(env, "JWT_SECRET");
  const jwtExpiresIn = requireString(env, "JWT_EXPIRES_IN");
  const jwtRefreshSecret = requireString(env, "JWT_REFRESH_SECRET");
  const jwtRefreshExpiresIn = requireString(env, "JWT_REFRESH_EXPIRES_IN");
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() ?? "development";

  validateUrl(databaseUrl, "DATABASE_URL", ["postgresql:", "postgres:"]);
  validateDuration(jwtExpiresIn, "JWT_EXPIRES_IN");
  validateDuration(jwtRefreshExpiresIn, "JWT_REFRESH_EXPIRES_IN");
  validateMinLength(jwtSecret, "JWT_SECRET", 32);
  validateMinLength(jwtRefreshSecret, "JWT_REFRESH_SECRET", 32);

  /** Valores de fallback do código (ConfigService) — nunca em produção com segredos assim. */
  const knownDevSecrets = [
    "leadflow_access_secret",
    "leadflow_refresh_secret",
  ] as const;
  const jwtSecretLc = jwtSecret.toLowerCase();
  const jwtRefreshLc = jwtRefreshSecret.toLowerCase();

  if (nodeEnv === "production") {
    if (
      jwtSecret.includes("sua_chave") ||
      jwtRefreshSecret.includes("sua_chave")
    ) {
      throw new Error(
        "JWT_SECRET e JWT_REFRESH_SECRET devem ser substituidos por valores reais.",
      );
    }
    if (jwtSecret === jwtRefreshSecret) {
      throw new Error(
        "Em producao JWT_SECRET e JWT_REFRESH_SECRET devem ser distintos (evita reutilizar o mesmo segredo para access e refresh).",
      );
    }
    for (const forbidden of knownDevSecrets) {
      if (jwtSecretLc === forbidden || jwtRefreshLc === forbidden) {
        throw new Error(
          "JWT_SECRET e JWT_REFRESH_SECRET nao podem usar os valores padrao de desenvolvimento em producao.",
        );
      }
    }
    if (jwtSecretLc.includes("changeme") || jwtRefreshLc.includes("changeme")) {
      throw new Error(
        'Remova placeholders como "changeme" dos JWTs em producao.',
      );
    }
    const allowResetToken =
      env.ALLOW_PASSWORD_RESET_TOKEN_RESPONSE?.trim().toLowerCase();
    if (allowResetToken === "true" || allowResetToken === "1") {
      throw new Error(
        "ALLOW_PASSWORD_RESET_TOKEN_RESPONSE nao pode estar ativo em producao " +
          "(o token de reset seria exposto no JSON da API).",
      );
    }
  }

  const optionalHttpUrls = [
    "META_REDIRECT_URI",
    "FACEBOOK_REDIRECT_URI",
    "META_WEBHOOK_CALLBACK_URL",
    "META_WHATSAPP_WEBHOOK_CALLBACK_URL",
    "FRONTEND_URL",
    "SENTRY_DSN",
  ];

  for (const key of optionalHttpUrls) {
    const value = env[key]?.trim();
    if (value) {
      if (key === "FRONTEND_URL") {
        validateOptionalHttpOriginList(value, key);
      } else {
        validateUrl(value, key, ["http:", "https:"]);
      }
    }
  }

  const integrationKey = env.LEADFLOW_INTEGRATION_API_KEY?.trim();
  const metaIngestionKey = env.LEADFLOW_META_INGESTION_API_KEY?.trim();
  const integrationActor = env.LEADFLOW_INTEGRATION_ACTOR_USER_ID?.trim();
  const integrationClientId = env.LEADFLOW_INTEGRATION_CLIENT_ID?.trim();
  const allowLegacyIntegrationKey =
    env.ALLOW_LEGACY_INTEGRATION_KEY?.trim().toLowerCase();
  if (
    allowLegacyIntegrationKey &&
    !["true", "false", "1", "0"].includes(allowLegacyIntegrationKey)
  ) {
    throw new Error("ALLOW_LEGACY_INTEGRATION_KEY deve ser true ou false.");
  }
  if (integrationKey) {
    validateMinLength(integrationKey, "LEADFLOW_INTEGRATION_API_KEY", 32);
  }
  if (metaIngestionKey) {
    validateMinLength(metaIngestionKey, "LEADFLOW_META_INGESTION_API_KEY", 32);
  }
  if (integrationKey && metaIngestionKey === integrationKey) {
    throw new Error(
      "LEADFLOW_META_INGESTION_API_KEY deve ser diferente da chave legada de integracao.",
    );
  }
  if (
    integrationClientId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      integrationClientId,
    )
  ) {
    throw new Error("LEADFLOW_INTEGRATION_CLIENT_ID deve ser um UUID valido.");
  }
  if (nodeEnv === "production" && integrationKey && !integrationClientId) {
    throw new Error(
      "LEADFLOW_INTEGRATION_CLIENT_ID e obrigatorio em producao quando a chave de integracao esta ativa.",
    );
  }
  if (
    nodeEnv === "production" &&
    integrationKey &&
    !["true", "1"].includes(allowLegacyIntegrationKey ?? "")
  ) {
    throw new Error(
      "Chave global legada desativada em producao. Remova LEADFLOW_INTEGRATION_API_KEY ou defina ALLOW_LEGACY_INTEGRATION_KEY=true temporariamente durante a migracao.",
    );
  }
  if (integrationKey && !integrationActor) {
    // Aviso apenas — o app funciona sem actor, mas o CRM nao move automaticamente.
    console.warn(
      "[config] LEADFLOW_INTEGRATION_API_KEY definida sem LEADFLOW_INTEGRATION_ACTOR_USER_ID. " +
        "O CRM nao sera movido automaticamente em agendamentos. " +
        "Defina LEADFLOW_INTEGRATION_ACTOR_USER_ID com o UUID de um usuario GESTOR para ativar o recurso.",
    );
  }
  if (
    integrationActor &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      integrationActor,
    )
  ) {
    throw new Error(
      "LEADFLOW_INTEGRATION_ACTOR_USER_ID deve ser um UUID valido.",
    );
  }

  return {
    ...env,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrlRaw ?? env.REDIS_URL,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    JWT_REFRESH_EXPIRES_IN: jwtRefreshExpiresIn,
  };
}

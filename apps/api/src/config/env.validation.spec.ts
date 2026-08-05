import { validateEnvironment } from "./env.validation";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/leadflow",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "access-secret-with-at-least-32-characters",
  JWT_EXPIRES_IN: "15m",
  JWT_REFRESH_SECRET: "refresh-secret-with-at-least-32-characters",
  JWT_REFRESH_EXPIRES_IN: "7d",
};

describe("validateEnvironment", () => {
  it("rejeita chave de integração curta", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LEADFLOW_INTEGRATION_API_KEY: "short-key",
      }),
    ).toThrow("LEADFLOW_INTEGRATION_API_KEY deve ter no minimo 32 caracteres.");
  });

  it("aceita chave de integração com entropia compatível", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LEADFLOW_INTEGRATION_API_KEY: "integration-secret-with-32-characters",
        LEADFLOW_INTEGRATION_ACTOR_USER_ID:
          "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      }),
    ).not.toThrow();
  });

  it("rejeita chave de ingestao Meta curta", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LEADFLOW_META_INGESTION_API_KEY: "short-key",
      }),
    ).toThrow(
      "LEADFLOW_META_INGESTION_API_KEY deve ter no minimo 32 caracteres.",
    );
  });

  it("exige chaves distintas para ingestao Meta e integracao legada", () => {
    const duplicatedKey = "integration-secret-with-32-characters";
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LEADFLOW_INTEGRATION_API_KEY: duplicatedKey,
        LEADFLOW_META_INGESTION_API_KEY: duplicatedKey,
      }),
    ).toThrow(
      "LEADFLOW_META_INGESTION_API_KEY deve ser diferente da chave legada de integracao.",
    );
  });

  it("exige escopo de cliente para integração em produção", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        LEADFLOW_INTEGRATION_API_KEY: "integration-secret-with-32-characters",
      }),
    ).toThrow("LEADFLOW_INTEGRATION_CLIENT_ID e obrigatorio em producao");
  });

  it("exige opt-in explicito para chave global legada em producao", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        LEADFLOW_INTEGRATION_API_KEY: "integration-secret-with-32-characters",
        LEADFLOW_INTEGRATION_CLIENT_ID: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      }),
    ).toThrow("Chave global legada desativada em producao");
  });
});

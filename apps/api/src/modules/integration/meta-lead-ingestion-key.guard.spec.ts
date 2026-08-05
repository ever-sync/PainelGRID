import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { MetaLeadIngestionKeyGuard } from "./meta-lead-ingestion-key.guard";

const ingestionKey = "meta-ingestion-secret-with-32-characters";

function contextFor(headers: Request["headers"]): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

function createGuard(configuredKey?: string) {
  const config = {
    get: jest.fn((key: string) =>
      key === "LEADFLOW_META_INGESTION_API_KEY" ? configuredKey : undefined,
    ),
  } as unknown as ConfigService;
  return new MetaLeadIngestionKeyGuard(config);
}

describe("MetaLeadIngestionKeyGuard", () => {
  it("aceita a chave exclusiva de ingestao Meta", () => {
    const guard = createGuard(ingestionKey);

    expect(
      guard.canActivate(
        contextFor({ "x-leadflow-meta-ingestion-key": ingestionKey }),
      ),
    ).toBe(true);
  });

  it("rejeita request sem chave", () => {
    const guard = createGuard(ingestionKey);

    expect(() => guard.canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejeita chave incorreta", () => {
    const guard = createGuard(ingestionKey);

    expect(() =>
      guard.canActivate(
        contextFor({
          "x-leadflow-meta-ingestion-key":
            "outra-chave-incorreta-com-32-caracteres",
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("informa indisponibilidade quando o segredo nao foi configurado", () => {
    const guard = createGuard();

    expect(() =>
      guard.canActivate(
        contextFor({ "x-leadflow-meta-ingestion-key": ingestionKey }),
      ),
    ).toThrow(ServiceUnavailableException);
  });
});

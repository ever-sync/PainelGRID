import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AutomationKeyGuard } from "./automation-key.guard";

describe("AutomationKeyGuard", () => {
  function context(value?: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: value ? { "x-n8n-automation-key": value } : {},
        }),
      }),
    } as any;
  }

  it("aceita a chave correta", () => {
    const config = { get: jest.fn().mockReturnValue("automation-secret") };
    const guard = new AutomationKeyGuard(config as unknown as ConfigService);
    expect(guard.canActivate(context("automation-secret"))).toBe(true);
  });

  it("recusa chave ausente ou incorreta", () => {
    const config = { get: jest.fn().mockReturnValue("automation-secret") };
    const guard = new AutomationKeyGuard(config as unknown as ConfigService);
    expect(() => guard.canActivate(context("wrong"))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });
});

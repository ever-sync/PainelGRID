import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";

const request = require("supertest");
import { REFRESH_TOKEN_COOKIE_NAME } from "../src/modules/auth/auth-cookie.constants";
import { AuthController } from "../src/modules/auth/auth.controller";
import { AuthService } from "../src/modules/auth/auth.service";

describe("AuthController (integration)", () => {
  const mockTtl = {
    getRefreshJwtTtlSeconds: jest.fn().mockReturnValue(604800),
  };

  async function createApp(
    mockAuth: Partial<Record<keyof AuthService, jest.Mock>>,
    withUser = false,
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { ...mockTtl, ...mockAuth } },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use(cookieParser());
    if (withUser) {
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { user?: object }).user = {
          sub: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
          email: "gestor@demo.com",
          name: "Gestor Demo",
          role: "gestor",
          client_id: null,
        };
        next();
      });
    }
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    return app;
  }

  beforeEach(() => {
    mockTtl.getRefreshJwtTtlSeconds.mockReturnValue(604800);
  });

  it("POST /api/auth/login cria sessao web e refresh em cookie", async () => {
    const svcBody = {
      user: { id: "user-1", email: "gestor@demo.com", role: "gestor" },
      access_token: "access-token",
      refresh_token: "refresh-token",
      remember: true,
    };
    const mockAuth = { login: jest.fn().mockResolvedValue(svcBody) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("X-Client-Platform", "capacitor")
      .send({ email: "gestor@demo.com", password: "senha1234" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcBody.user,
      access_token: "access-token",
    });
    expect(res.headers["set-cookie"]?.[0]).toContain("refresh-token");
    expect(mockAuth.login).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "gestor@demo.com",
        password: "senha1234",
      }),
    );

    await app.close();
  });

  it("POST /api/auth/mobile/login devolve os tokens no corpo", async () => {
    const svcBody = {
      user: { id: "user-1", email: "gestor@demo.com", role: "gestor" },
      access_token: "access-token",
      refresh_token: "refresh-token",
      remember: true,
    };
    const mockAuth = { login: jest.fn().mockResolvedValue(svcBody) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/mobile/login")
      .send({ email: "gestor@demo.com", password: "senha1234" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcBody.user,
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(res.headers["set-cookie"]).toBeUndefined();

    await app.close();
  });

  it("POST /api/auth/login rejeita email invalido (400)", async () => {
    const mockAuth = { login: jest.fn() };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "nao-email", password: "senha1234" });

    expect(res.status).toBe(400);
    expect(mockAuth.login).not.toHaveBeenCalled();

    await app.close();
  });

  it("POST /api/auth/2fa/verify envia refresh somente no cookie web", async () => {
    const svcBody = {
      access_token: "at",
      refresh_token: "rt",
      remember: true,
      user: {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        email: "gestor@demo.com",
        name: "Gestor",
        role: "gestor",
      },
    };
    const mockAuth = { verifyTwoFactor: jest.fn().mockResolvedValue(svcBody) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/2fa/verify")
      .send({
        temp_token: "11111111-1111-4111-8111-111111111111",
        code: "123456",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ user: svcBody.user, access_token: "at" });
    expect(res.body.refresh_token).toBeUndefined();
    expect(String(res.headers["set-cookie"])).toContain(
      `${REFRESH_TOKEN_COOKIE_NAME}=rt`,
    );

    await app.close();
  });

  it("POST /api/auth/mobile/2fa/verify envia refresh no JSON sem cookie", async () => {
    const svcBody = {
      access_token: "at",
      refresh_token: "rt",
      remember: true,
      user: {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        email: "gestor@demo.com",
        name: "Gestor",
        role: "gestor",
      },
    };
    const mockAuth = { verifyTwoFactor: jest.fn().mockResolvedValue(svcBody) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/mobile/2fa/verify")
      .send({
        temp_token: "11111111-1111-4111-8111-111111111111",
        code: "123456",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcBody.user,
      access_token: "at",
      refresh_token: "rt",
    });
    expect(res.headers["set-cookie"]).toBeUndefined();

    await app.close();
  });

  it("POST /api/auth/refresh rejeita refresh enviado no corpo sem cookie", async () => {
    const svcRefresh = {
      access_token: "novo-token",
      refresh_token: "novo-rt",
      user: {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        email: "gestor@demo.com",
        name: "Gestor",
        role: "gestor",
      },
    };
    const mockAuth = { refresh: jest.fn().mockResolvedValue(svcRefresh) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: "refresh-demo-token-123" });

    expect(res.status).toBe(401);
    expect(mockAuth.refresh).not.toHaveBeenCalled();

    await app.close();
  });

  it("POST /api/auth/mobile/refresh envia token rotacionado no JSON sem cookie", async () => {
    const svcRefresh = {
      access_token: "novo-token",
      refresh_token: "novo-rt",
      user: {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        email: "gestor@demo.com",
        name: "Gestor",
        role: "gestor",
      },
    };
    const mockAuth = { refresh: jest.fn().mockResolvedValue(svcRefresh) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/mobile/refresh")
      .send({ refreshToken: "refresh-demo-token-123" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcRefresh.user,
      access_token: "novo-token",
      refresh_token: "novo-rt",
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(mockAuth.refresh).toHaveBeenCalledWith("refresh-demo-token-123");

    await app.close();
  });

  it("POST /api/auth/refresh aceita cookie httpOnly", async () => {
    const svcRefresh = {
      access_token: "novo-token",
      refresh_token: "rotated",
      user: {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        email: "gestor@demo.com",
        name: "Gestor",
        role: "gestor",
      },
    };
    const mockAuth = { refresh: jest.fn().mockResolvedValue(svcRefresh) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", [`${REFRESH_TOKEN_COOKIE_NAME}=cookie-refresh-jwt`])
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcRefresh.user,
      access_token: "novo-token",
    });
    expect(res.body.refresh_token).toBeUndefined();
    expect(String(res.headers["set-cookie"])).toContain(
      `${REFRESH_TOKEN_COOKIE_NAME}=rotated`,
    );
    expect(mockAuth.refresh).toHaveBeenCalledWith("cookie-refresh-jwt");

    await app.close();
  });

  it("POST /api/auth/logout prioriza cookie e retorna mensagem fixa", async () => {
    const mockAuth = {
      logout: jest.fn().mockResolvedValue({ message: "ok service" }),
    };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Cookie", [`${REFRESH_TOKEN_COOKIE_NAME}=rt-from-cookie`])
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: "Logout realizado com sucesso" });
    expect(mockAuth.logout).toHaveBeenCalledWith("rt-from-cookie");

    await app.close();
  });

  it("POST /api/auth/logout sem token ainda assim limpa cookie", async () => {
    const mockAuth = { logout: jest.fn() };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .send({});

    expect(res.status).toBe(201);
    expect(mockAuth.logout).not.toHaveBeenCalled();
    const cleared = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"].join(";")
      : String(res.headers["set-cookie"] ?? "");
    expect(cleared).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=`);
    expect(cleared.toLowerCase()).toMatch(/max-age=0|expires=.*1970/);

    await app.close();
  });

  it("POST /api/auth/mobile/logout revoga token do corpo sem manipular cookie", async () => {
    const mockAuth = { logout: jest.fn().mockResolvedValue({ message: "ok" }) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post("/api/auth/mobile/logout")
      .send({ refreshToken: "refresh-demo-token-123" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: "Logout realizado com sucesso" });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(mockAuth.logout).toHaveBeenCalledWith("refresh-demo-token-123");

    await app.close();
  });

  it("GET /api/auth/me retorna usuario autenticado", async () => {
    const body = {
      sub: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      email: "gestor@demo.com",
      name: "Gestor Demo",
      role: "gestor",
      client_id: null,
    };
    const mockAuth = { me: jest.fn().mockResolvedValue(body) };
    const app = await createApp(mockAuth, true);

    const res = await request(app.getHttpServer()).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(mockAuth.me).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: body.sub,
        email: body.email,
        role: body.role,
      }),
    );

    await app.close();
  });
});

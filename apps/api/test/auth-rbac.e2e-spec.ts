import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { CurrentUser, Public, Roles } from "../src/common/decorators";
import { Role } from "../src/common/types";
import { RolesGuard } from "../src/modules/auth/guards/roles.guard";

const request = require("supertest");

type TestUser = {
  sub: string;
  role: Role;
  email: string;
  name: string;
};

@Controller("auth")
class TestAuthController {
  @Public()
  @Post("login")
  login() {
    return {
      access_token: "gestor-token",
      refresh_token: "refresh-token",
    };
  }

  @Get("me")
  me(@CurrentUser() user: TestUser) {
    return user;
  }
}

@Controller("users")
@Roles(Role.GESTOR)
class TestUsersController {
  @Get()
  findAll() {
    return [{ id: "user-1" }];
  }
}

class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const isPublic =
      Reflect.getMetadata("isPublic", context.getHandler()) ||
      Reflect.getMetadata("isPublic", context.getClass());

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: TestUser;
    }>();
    const authorization = request.headers.authorization;

    if (authorization === "Bearer gestor-token") {
      request.user = {
        sub: "gestor-1",
        role: Role.GESTOR,
        email: "gestor@leadflow.com",
        name: "Gestor",
      };
      return true;
    }

    if (authorization === "Bearer vendedor-token") {
      request.user = {
        sub: "vendedor-1",
        role: Role.VENDEDOR,
        email: "vendedor@leadflow.com",
        name: "Vendedor",
      };
      return true;
    }

    throw new UnauthorizedException("Token ausente ou invalido");
  }
}

describe("Auth + RBAC (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestAuthController, TestUsersController],
      providers: [
        Reflector,
        RolesGuard,
        {
          provide: APP_GUARD,
          useClass: TestJwtAuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("permite login sem token", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .expect(201)
      .expect(({ body }: { body: { access_token: string } }) => {
        expect(body.access_token).toBe("gestor-token");
      });
  });

  it("bloqueia auth/me sem token", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });

  it("bloqueia users para perfil vendedor", async () => {
    await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", "Bearer vendedor-token")
      .expect(403);
  });

  it("permite users para perfil gestor", async () => {
    await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", "Bearer gestor-token")
      .expect(200)
      .expect([{ id: "user-1" }]);
  });
});

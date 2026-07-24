import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { CurrentUser } from '../src/common/decorators';
import { Role } from '../src/common/types';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { AuthenticatedUser, AuthTokenPayload } from '../src/modules/auth/auth.types';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UsersService } from '../src/modules/users/users.service';

const request = require('supertest');

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

jest.mock('uuid', () => ({
  validate: jest.fn((value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  ),
}));

@Controller('auth')
class TestProtectedAuthController {
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}

describe('JwtStrategy (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const localUser = {
    id: 'd958412d-92f5-4420-9bca-8ed20ff5d1ce',
    email: 'gestor@leadflow.com',
    name: 'Gestor Leadflow',
    role: Role.GESTOR,
    client_id: null,
    is_active: true,
  };

  const jwtSecret = 'test-access-secret-with-32-plus-chars';

  beforeAll(async () => {
    const usersServiceMock = {
      getEntityById: jest.fn(async (id: string) => (id === localUser.id ? localUser : null)),
      findByAuthProviderId: jest.fn(async () => null),
      getEntityByEmail: jest.fn(async () => null),
      updateAuthProviderId: jest.fn(async () => null),
    };

    const configServiceMock = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'JWT_SECRET') return jwtSecret;
        if (key === 'AUTH_PROVIDER_ISSUER') return undefined;
        if (key === 'AUTH_PROVIDER_AUDIENCE') return undefined;
        return fallback;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestProtectedAuthController],
      providers: [
        Reflector,
        JwtService,
        JwtStrategy,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('aceita access token local HS256 recém emitido em /auth/me', async () => {
    const payload: AuthTokenPayload = {
      sub: localUser.id,
      email: localUser.email,
      name: localUser.name,
      role: localUser.role,
      client_id: null,
      type: 'access',
    };

    const accessToken = await jwtService.signAsync(payload, {
      secret: jwtSecret,
      expiresIn: '15m',
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }: { body: AuthenticatedUser }) => {
        expect(body.sub).toBe(localUser.id);
        expect(body.email).toBe(localUser.email);
        expect(body.role).toBe(localUser.role);
      });
  });
});

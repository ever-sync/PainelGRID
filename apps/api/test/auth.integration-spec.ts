import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';

const request = require('supertest');
import { REFRESH_TOKEN_COOKIE_NAME } from '../src/modules/auth/auth-cookie.constants';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';

describe('AuthController (integration)', () => {
  const mockTtl = { getRefreshJwtTtlSeconds: jest.fn().mockReturnValue(604800) };

  async function createApp(
    mockAuth: Partial<Record<keyof AuthService, jest.Mock>>,
    withUser = false,
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { ...mockTtl, ...mockAuth } }],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use(cookieParser());
    if (withUser) {
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { user?: object }).user = {
          sub: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
          email: 'gestor@demo.com',
          name: 'Gestor Demo',
          role: 'gestor',
          client_id: null,
        };
        next();
      });
    }
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    return app;
  }

  beforeEach(() => {
    mockTtl.getRefreshJwtTtlSeconds.mockReturnValue(604800);
  });

  it('POST /api/auth/login envia refresh em cookie httpOnly e omite do JSON web', async () => {
    const svcBody = {
      access_token: 'at',
      refresh_token: 'rt',
      user: {
        id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor',
        role: 'gestor',
      },
    };
    const mockAuth = { login: jest.fn().mockResolvedValue(svcBody) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'gestor@demo.com', password: 'senha1234' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcBody.user,
      access_token: 'at',
    });
    expect(String(res.headers['set-cookie'])).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=rt`);
    expect(mockAuth.login).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'gestor@demo.com', password: 'senha1234' }),
    );

    await app.close();
  });

  it('POST /api/auth/login envia refresh no JSON para cliente Capacitor', async () => {
    const svcBody = {
      access_token: 'at',
      refresh_token: 'rt',
      user: {
        id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor',
        role: 'gestor',
      },
    };
    const mockAuth = { login: jest.fn().mockResolvedValue(svcBody) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Client-Platform', 'capacitor')
      .send({ email: 'gestor@demo.com', password: 'senha1234' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcBody.user,
      access_token: 'at',
      refresh_token: 'rt',
    });
    expect(String(res.headers['set-cookie'])).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=rt`);

    await app.close();
  });

  it('POST /api/auth/login rejeita email invalido (400)', async () => {
    const mockAuth = { login: jest.fn() };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nao-email', password: 'senha1234' });

    expect(res.status).toBe(400);
    expect(mockAuth.login).not.toHaveBeenCalled();

    await app.close();
  });

  it('POST /api/auth/refresh delega string e omite refresh do JSON web', async () => {
    const svcRefresh = {
      access_token: 'novo-token',
      refresh_token: 'novo-rt',
      user: {
        id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor',
        role: 'gestor',
      },
    };
    const mockAuth = { refresh: jest.fn().mockResolvedValue(svcRefresh) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'refresh-demo-token-123' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcRefresh.user,
      access_token: 'novo-token',
    });
    expect(String(res.headers['set-cookie'])).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=novo-rt`);
    expect(mockAuth.refresh).toHaveBeenCalledWith('refresh-demo-token-123');

    await app.close();
  });

  it('POST /api/auth/refresh envia token rotacionado no JSON para Capacitor', async () => {
    const svcRefresh = {
      access_token: 'novo-token',
      refresh_token: 'novo-rt',
      user: {
        id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor',
        role: 'gestor',
      },
    };
    const mockAuth = { refresh: jest.fn().mockResolvedValue(svcRefresh) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('X-Client-Platform', 'capacitor')
      .send({ refreshToken: 'refresh-demo-token-123' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: svcRefresh.user,
      access_token: 'novo-token',
      refresh_token: 'novo-rt',
    });
    expect(String(res.headers['set-cookie'])).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=novo-rt`);
    expect(mockAuth.refresh).toHaveBeenCalledWith('refresh-demo-token-123');

    await app.close();
  });

  it('POST /api/auth/refresh aceita cookie httpOnly', async () => {
    const svcRefresh = {
      access_token: 'novo-token',
      refresh_token: 'rotated',
      user: {
        id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor',
        role: 'gestor',
      },
    };
    const mockAuth = { refresh: jest.fn().mockResolvedValue(svcRefresh) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_TOKEN_COOKIE_NAME}=cookie-refresh-jwt`])
      .send({});

    expect(res.status).toBe(201);
    expect(mockAuth.refresh).toHaveBeenCalledWith('cookie-refresh-jwt');

    await app.close();
  });

  it('POST /api/auth/logout prioriza cookie e retorna mensagem fixa', async () => {
    const mockAuth = { logout: jest.fn().mockResolvedValue({ message: 'ok service' }) };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', [`${REFRESH_TOKEN_COOKIE_NAME}=rt-from-cookie`])
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Logout realizado com sucesso' });
    expect(mockAuth.logout).toHaveBeenCalledWith('rt-from-cookie');

    await app.close();
  });

  it('POST /api/auth/logout sem token ainda assim limpa cookie', async () => {
    const mockAuth = { logout: jest.fn() };
    const app = await createApp(mockAuth);

    const res = await request(app.getHttpServer()).post('/api/auth/logout').send({});

    expect(res.status).toBe(201);
    expect(mockAuth.logout).not.toHaveBeenCalled();
    const cleared = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'].join(';')
      : String(res.headers['set-cookie'] ?? '');
    expect(cleared).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=`);
    expect(cleared.toLowerCase()).toMatch(/max-age=0|expires=.*1970/);

    await app.close();
  });

  it('GET /api/auth/me retorna usuario autenticado', async () => {
    const body = {
      sub: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      email: 'gestor@demo.com',
      name: 'Gestor Demo',
      role: 'gestor',
      client_id: null,
    };
    const mockAuth = { me: jest.fn().mockResolvedValue(body) };
    const app = await createApp(mockAuth, true);

    const res = await request(app.getHttpServer()).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(mockAuth.me).toHaveBeenCalledWith(
      expect.objectContaining({ sub: body.sub, email: body.email, role: body.role }),
    );

    await app.close();
  });
});

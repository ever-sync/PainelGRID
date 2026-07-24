import { HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { MailService } from '../../mail/mail.service';
import { Role } from '../../common/types';
import { RedisService } from '../../config/redis.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomInt: jest.fn(),
  randomUUID: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  const user = {
    id: 'user-1',
    name: 'Gestor Teste',
    email: 'gestor@leadflow.com',
    password_hash: 'hashed-password',
    role: Role.GESTOR,
    client_id: null as string | null,
    avatar_url: null,
    phone: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    meta_gestor_access_token: null as string | null,
    meta_gestor_token_expires_at: null as Date | null,
    meta_gestor_scopes: [] as string[],
    meta_gestor_connected_at: null as Date | null,
    vendor_category: null,
    vendor_categories: [] as import('../../common/types').VendorCategory[],
    auth_provider_id: null as string | null,
    rating_token: null as string | null,
  };

  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let redisService: {
    client: { get: jest.Mock; set: jest.Mock; del: jest.Mock; scan: jest.Mock };
    consumeTwoFactorChallenge: jest.Mock;
  };
  let configService: ConfigService;
  let mailService: jest.Mocked<Pick<MailService, 'sendTwoFactorCode'>>;

  beforeEach(() => {
    usersService = {
      getEntityByEmail: jest.fn(),
      getEntityById: jest.fn(),
      updatePasswordHash: jest.fn(),
      findById: jest.fn(),
      sanitizeUser: jest
        .fn()
        .mockImplementation(({ password_hash: _passwordHash, ...safeUser }) => safeUser),
    } as unknown as jest.Mocked<UsersService>;

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    redisService = {
      client: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        scan: jest.fn(),
      },
      consumeTwoFactorChallenge: jest.fn(),
    };
    mailService = {
      sendTwoFactorCode: jest.fn().mockResolvedValue(undefined),
    };
    (randomInt as jest.Mock).mockReturnValue(123456);
    (randomUUID as jest.Mock).mockReturnValue('11111111-1111-4111-8111-111111111111');

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          JWT_SECRET: 'access-secret',
          JWT_EXPIRES_IN: '15m',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };

        return values[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    service = new AuthService(
      usersService,
      jwtService,
      configService,
      redisService as unknown as RedisService,
      mailService as unknown as MailService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (bcrypt.compare as jest.Mock).mockReset();
    (bcrypt.hash as jest.Mock).mockReset();
    (randomUUID as jest.Mock).mockReset();
    (randomInt as jest.Mock).mockReset();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('cria desafio 2FA criptograficamente aleatorio no login valido', async () => {
    usersService.getEntityByEmail.mockResolvedValue(user);
    redisService.client.set.mockResolvedValue('OK');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (randomUUID as jest.Mock).mockReturnValue('11111111-1111-4111-8111-111111111111');
    (randomInt as jest.Mock).mockReturnValue(123456);

    const result = await service.login({
      email: user.email,
      password: '12345678',
    });

    expect(result).toEqual({
      requires_2fa: true,
      temp_token: '11111111-1111-4111-8111-111111111111',
      message: 'Código de verificação enviado para o seu e-mail.',
      dev_code_hint: '123456',
    });
    expect(redisService.client.set).toHaveBeenCalledWith(
      'auth:2fa:11111111-1111-4111-8111-111111111111',
      expect.not.stringContaining('123456'),
      'EX',
      600,
    );
    expect(mailService.sendTwoFactorCode).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email, code: '123456' }),
    );
    expect(redisService.client.del).toHaveBeenCalledWith(`auth:login-fail:${user.email}`);
  });

  it('consome atomicamente um desafio 2FA valido e emite a sessao', async () => {
    redisService.consumeTwoFactorChallenge.mockResolvedValue({
      status: 'valid',
      payload: JSON.stringify({ userId: user.id, rememberMe: true }),
    });
    usersService.getEntityById.mockResolvedValue(user);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    redisService.client.set.mockResolvedValue('OK');

    const result = await service.verifyTwoFactor(
      '11111111-1111-4111-8111-111111111111',
      '123456',
    );

    expect(redisService.consumeTwoFactorChallenge).toHaveBeenCalledWith(
      'auth:2fa:11111111-1111-4111-8111-111111111111',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      5,
    );
    expect(result).toEqual(
      expect.objectContaining({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    );
  });

  it('rotaciona o refresh token quando o token e valido', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      type: 'refresh',
      jti: 'refresh-1',
    });
    redisService.client.get.mockResolvedValue(user.id);
    redisService.client.del.mockResolvedValue(1);
    usersService.getEntityById.mockResolvedValue(user);
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');
    redisService.client.set.mockResolvedValue('OK');

    const result = await service.refresh('valid-refresh-token');

    expect(redisService.client.del).toHaveBeenCalledWith('auth:refresh:refresh-1');
    expect(result.access_token).toBe('new-access-token');
    expect(result.refresh_token).toBe('new-refresh-token');
  });

  it('altera a senha do usuario autenticado e revoga refresh tokens antigos', async () => {
    usersService.getEntityById.mockResolvedValue(user);
    usersService.updatePasswordHash.mockResolvedValue(undefined);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
    redisService.client.scan
      .mockResolvedValueOnce(['0', ['auth:refresh:one', 'auth:refresh:two']])
      .mockResolvedValueOnce(['0', []]);
    redisService.client.get.mockResolvedValueOnce(user.id).mockResolvedValueOnce('other-user');
    redisService.client.del.mockResolvedValue(2);

    const result = await service.changePassword(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        client_id: user.client_id,
      },
      {
        current_password: '12345678',
        new_password: 'NovaSenha876',
      },
    );

    expect(usersService.updatePasswordHash).toHaveBeenCalledWith(user.id, 'new-hashed-password');
    expect(redisService.client.del).toHaveBeenCalledWith('auth:refresh:one');
    expect(result).toEqual({ message: 'Senha alterada com sucesso' });
  });

  it('gera token de recuperacao de senha para um e-mail valido', async () => {
    process.env.NODE_ENV = 'development';
    usersService.getEntityByEmail.mockResolvedValue(user);
    (randomUUID as jest.Mock).mockReturnValue('reset-token-1');
    redisService.client.set.mockResolvedValue('OK');

    const result = await service.requestPasswordReset({
      email: user.email,
    });

    expect(redisService.client.set).toHaveBeenCalledWith(
      'auth:password-reset:reset-token-1',
      user.id,
      'EX',
      1800,
    );
    expect(result).toEqual({
      message:
        'Se esse e-mail estiver cadastrado em nosso sistema, voce recebera instrucoes para redefinicao em instantes.',
      reset_token: 'reset-token-1',
      expires_in_minutes: 30,
    });
  });

  it('nao retorna token de recuperacao de senha em producao', async () => {
    process.env.NODE_ENV = 'production';
    usersService.getEntityByEmail.mockResolvedValue(user);
    (randomUUID as jest.Mock).mockReturnValue('reset-token-1');
    redisService.client.set.mockResolvedValue('OK');

    const result = await service.requestPasswordReset({
      email: user.email,
    });

    expect(result).toEqual({
      message:
        'Se esse e-mail estiver cadastrado em nosso sistema, voce recebera instrucoes para redefinicao em instantes.',
      expires_in_minutes: 30,
    });
  });

  it('resposta anonima quando o e-mail nao existe', async () => {
    usersService.getEntityByEmail.mockResolvedValue(null);

    const result = await service.requestPasswordReset({
      email: 'ghost@demo.com',
    });

    expect(redisService.client.set).not.toHaveBeenCalled();
    expect(result).toEqual({
      message:
        'Se esse e-mail estiver cadastrado em nosso sistema, voce recebera instrucoes para redefinicao em instantes.',
      expires_in_minutes: 30,
    });
  });

  it('redefine a senha usando um token de recuperacao valido', async () => {
    usersService.getEntityById.mockResolvedValue(user);
    redisService.client.get.mockResolvedValue(user.id);
    redisService.client.del.mockResolvedValue(1);
    usersService.updatePasswordHash.mockResolvedValue(undefined);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
    redisService.client.scan.mockResolvedValue(['0', []]);

    const result = await service.resetPassword({
      reset_token: 'reset-token-1',
      new_password: 'NovaSenha876',
    });

    expect(usersService.updatePasswordHash).toHaveBeenCalledWith(user.id, 'new-hashed-password');
    expect(redisService.client.del).toHaveBeenCalledWith('auth:password-reset:reset-token-1');
    expect(result).toEqual({ message: 'Senha redefinida com sucesso' });
  });

  it('falha com 503 quando Redis nao pode persistir a allowlist do refresh token', async () => {
    usersService.getEntityByEmail.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (randomUUID as jest.Mock).mockReturnValue('jti-sem-redis');
    redisService.client.set.mockRejectedValue(new Error('redis indisponivel'));

    await expect(
      service.login({
        email: user.email,
        password: '12345678',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('remove registro Redis se JWT falhar apos gravar a allowlist', async () => {
    redisService.consumeTwoFactorChallenge.mockResolvedValue({
      status: 'valid',
      payload: JSON.stringify({ userId: user.id, rememberMe: true }),
    });
    usersService.getEntityById.mockResolvedValue(user);
    (randomUUID as jest.Mock).mockReturnValue('jti-roll');
    redisService.client.set.mockResolvedValue('OK');
    jwtService.signAsync.mockRejectedValue(new Error('falha ao assinar JWT'));

    await expect(
      service.verifyTwoFactor('11111111-1111-4111-8111-111111111111', '123456'),
    ).rejects.toThrow('falha ao assinar JWT');

    expect(redisService.client.del).toHaveBeenCalledWith('auth:refresh:jti-roll');
  });

  it('falha com 503 quando Redis falha durante o refresh da sessao', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      type: 'refresh',
      jti: 'refresh-conn',
    });
    redisService.client.get.mockRejectedValue(new Error('conn'));

    await expect(service.refresh('tok')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('falha com 503 na recuperacao de senha quando Redis nao aceita gravacao', async () => {
    usersService.getEntityByEmail.mockResolvedValue(user);
    (randomUUID as jest.Mock).mockReturnValue('reset-x');
    redisService.client.set.mockRejectedValue(new Error('redis down'));

    await expect(service.requestPasswordReset({ email: user.email })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('falha no login quando a senha e invalida', async () => {
    usersService.getEntityByEmail.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        email: user.email,
        password: 'senha-errada',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redisService.client.set).toHaveBeenCalledWith(
      `auth:login-fail:${user.email}`,
      '1',
      'EX',
      900,
    );
  });

  it('bloqueia login apos muitas tentativas invalidas', async () => {
    redisService.client.get.mockResolvedValue('5');

    await expect(
      service.login({
        email: user.email,
        password: 'senha-errada',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(usersService.getEntityByEmail).not.toHaveBeenCalled();
  });

  it('falha ao alterar a senha quando a senha atual e invalida', async () => {
    usersService.getEntityById.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.changePassword(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          client_id: user.client_id,
        },
        {
          current_password: 'senha-errada',
          new_password: 'NovaSenha876',
        },
      ),
    ).rejects.toThrow('Senha atual invalida');
  });
});

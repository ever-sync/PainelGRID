import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { User } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHmac, randomUUID } from "crypto";
import { BCRYPT_SALT_ROUNDS } from "../../common/constants/bcrypt.constants";
import { parseDurationToSeconds } from "../../common/utils/parse-duration-to-seconds";
import { Role } from "../../common/types";
import { RedisService } from "../../config/redis.service";
import { UsersService } from "../users/users.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SetupPasswordDto } from "./dto/setup-password.dto";
import { PasswordSetupService } from "./password-setup.service";
import { UpdateOwnProfileDto } from "./dto/update-own-profile.dto";
import { AuthTokenPayload, AuthenticatedUser } from "./auth.types";

@Injectable()
export class AuthService {
  private static readonly loginRateLimitMaxAttempts = 5;
  private static readonly loginRateLimitWindowSeconds = 15 * 60;
  private static readonly twoFactorMaxAttempts = 5;
  private readonly logger = new Logger(AuthService.name);

  private readonly accessTokenSecret: string;
  private readonly accessTokenExpiresIn: JwtSignOptions["expiresIn"];
  private readonly refreshTokenSecret: string;
  private readonly refreshTokenExpiresIn: JwtSignOptions["expiresIn"];

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly passwordSetup: PasswordSetupService,
  ) {
    this.accessTokenSecret = this.configService.get<string>(
      "JWT_SECRET",
      "leadflow_access_secret",
    );
    this.accessTokenExpiresIn = this.configService.get<
      JwtSignOptions["expiresIn"]
    >("JWT_EXPIRES_IN", "15m");
    this.refreshTokenSecret = this.configService.get<string>(
      "JWT_REFRESH_SECRET",
      "leadflow_refresh_secret",
    );
    this.refreshTokenExpiresIn = this.configService.get<
      JwtSignOptions["expiresIn"]
    >("JWT_REFRESH_EXPIRES_IN", "7d");
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    await this.assertLoginAllowed(normalizedEmail);

    const user = await this.usersService.getEntityByEmail(normalizedEmail);

    if (!user || !user.is_active || !user.password_hash) {
      await this.registerFailedLogin(normalizedEmail);
      throw new UnauthorizedException("Credenciais invalidas");
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      await this.registerFailedLogin(normalizedEmail);
      throw new UnauthorizedException("Credenciais invalidas");
    }

    await this.clearFailedLoginAttempts(normalizedEmail);

    return this.buildAuthResponse(user, dto.remember_me ?? true);
  }

  async verifyTwoFactor(tempToken: string, code: string) {
    const redisKey = this.getTwoFactorKey(tempToken);
    const result = await this.redisService.consumeTwoFactorChallenge(
      redisKey,
      this.hashTwoFactorCode(tempToken, code.trim()),
      AuthService.twoFactorMaxAttempts,
    );

    if (result.status !== "valid") {
      throw new UnauthorizedException(
        "Código de verificação expirado ou inválido.",
      );
    }

    let parsed: { userId: string; rememberMe: boolean };
    try {
      parsed = JSON.parse(result.payload) as {
        userId: string;
        rememberMe: boolean;
      };
    } catch {
      throw new UnauthorizedException(
        "Código de verificação expirado ou inválido.",
      );
    }

    const user = await this.usersService.getEntityById(parsed.userId);
    if (!user || !user.is_active) {
      throw new UnauthorizedException("Usuário inativo ou inexistente.");
    }

    return this.buildAuthResponse(user, parsed.rememberMe);
  }

  private getTwoFactorKey(tempToken: string): string {
    return `auth:2fa:${tempToken}`;
  }

  private hashTwoFactorCode(tempToken: string, code: string): string {
    return createHmac("sha256", this.refreshTokenSecret)
      .update(`${tempToken}:${code}`)
      .digest("hex");
  }

  /** TTL do refresh em segundos (ex.: max-age do cookie httpOnly). */
  getRefreshJwtTtlSeconds(): number {
    return parseDurationToSeconds(String(this.refreshTokenExpiresIn ?? "7d"));
  }

  async refresh(refreshTokenRaw: string) {
    const payload = await this.verifyRefreshToken(refreshTokenRaw);
    const refreshKey = this.getRefreshTokenKey(payload.jti!);
    let storedUserId: string | null;
    try {
      storedUserId = await this.redisService.client.get(refreshKey);
    } catch (err) {
      this.logger.warn(
        `Redis indisponivel na renovacao: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        "Nao foi possivel renovar a sessao. Tente novamente em instantes.",
      );
    }

    if (storedUserId !== payload.sub) {
      throw new UnauthorizedException("Refresh token invalido ou expirado");
    }

    try {
      await this.redisService.client.del(refreshKey);
    } catch (err) {
      this.logger.error(
        `Redis indisponivel ao revogar refresh antigo: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        "Nao foi possivel concluir a renovacao da sessao. Tente novamente.",
      );
    }

    const user = await this.usersService.getEntityById(payload.sub);

    if (!user.is_active) {
      throw new UnauthorizedException("Usuario inativo");
    }

    /** Preserva a escolha original de "lembrar-me" a cada rotacao do refresh token. */
    return this.buildAuthResponse(user, payload.remember ?? true);
  }

  async logout(refreshTokenRaw: string) {
    const payload = await this.verifyRefreshToken(refreshTokenRaw);
    try {
      await this.redisService.client.del(this.getRefreshTokenKey(payload.jti!));
    } catch (err) {
      this.logger.warn(
        `Redis indisponivel ao encerrar sessao: ${(err as Error).message}`,
      );
    }

    return { message: "Logout realizado com sucesso" };
  }

  async me(authenticatedUser: AuthenticatedUser) {
    return this.usersService.findById(authenticatedUser.sub);
  }

  async uploadAvatar(
    authenticatedUser: AuthenticatedUser,
    buffer: Buffer,
    mimeType: string,
  ) {
    return this.usersService.updateOwnAvatar(
      authenticatedUser.sub,
      buffer,
      mimeType,
    );
  }

  async getAvatar(userId: string) {
    return this.usersService.getAvatar(userId);
  }

  async updateProfile(
    authenticatedUser: AuthenticatedUser,
    dto: UpdateOwnProfileDto,
  ) {
    return this.usersService.updateOwnProfile(authenticatedUser.sub, dto);
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.usersService.getEntityByEmail(normalizedEmail);

    /** Mesma resposta sempre (evita enumeracao de e-mails). */
    const neutralResponse = (): {
      message: string;
      expires_in_minutes: number;
      reset_token?: string;
    } => ({
      message:
        "Se esse e-mail estiver cadastrado em nosso sistema, voce recebera instrucoes para redefinicao em instantes.",
      expires_in_minutes: 30,
    });

    if (!user || !user.is_active || !user.password_hash) {
      return neutralResponse();
    }

    const resetToken = randomUUID();
    try {
      await this.redisService.client.set(
        this.getPasswordResetTokenKey(resetToken),
        user.id,
        "EX",
        60 * 30,
      );
    } catch (err) {
      this.logger.error(
        `Redis indisponivel ao salvar token de recuperacao de senha: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        "Servico temporariamente indisponivel. Tente novamente em alguns instantes.",
      );
    }

    const response = neutralResponse();

    if (this.shouldExposePasswordResetToken()) {
      response.reset_token = resetToken;
    }

    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenKey = this.getPasswordResetTokenKey(dto.reset_token);
    const userId = await this.redisService.client.get(tokenKey);

    if (!userId) {
      throw new BadRequestException(
        "Token de redefinicao invalido ou expirado",
      );
    }

    const user = await this.usersService.getEntityById(userId);

    if (!user.is_active || !user.password_hash) {
      throw new UnauthorizedException("Usuario inativo");
    }

    const newPasswordHash = await bcrypt.hash(
      dto.new_password,
      BCRYPT_SALT_ROUNDS,
    );
    await this.usersService.updatePasswordHash(user.id, newPasswordHash);
    await this.redisService.client.del(tokenKey);
    await this.revokeRefreshTokensForUser(user.id);

    return { message: "Senha redefinida com sucesso" };
  }

  async changePassword(
    authenticatedUser: AuthenticatedUser,
    dto: ChangePasswordDto,
  ) {
    const user = await this.usersService.getEntityById(authenticatedUser.sub);

    if (!user.is_active || !user.password_hash) {
      throw new UnauthorizedException("Usuario inativo");
    }

    const currentPasswordMatches = await bcrypt.compare(
      dto.current_password,
      user.password_hash,
    );

    if (!currentPasswordMatches) {
      throw new BadRequestException("Senha atual invalida");
    }

    if (dto.current_password === dto.new_password) {
      throw new BadRequestException(
        "A nova senha precisa ser diferente da atual",
      );
    }

    const newPasswordHash = await bcrypt.hash(
      dto.new_password,
      BCRYPT_SALT_ROUNDS,
    );
    await this.usersService.updatePasswordHash(user.id, newPasswordHash);
    await this.revokeRefreshTokensForUser(user.id);

    return { message: "Senha alterada com sucesso" };
  }

  private async buildAuthResponse(user: User, remember: boolean) {
    const tokens = await this.issueTokens(user, remember);

    let company_name: string | null = null;
    if (user.client_id) {
      const client = await this.usersService.getClientById(user.client_id);
      company_name = client?.company_name ?? null;
    }

    return {
      user: {
        ...this.usersService.sanitizeUser(user),
        company_name,
      },
      remember,
      ...tokens,
    };
  }

  private async issueTokens(user: User, remember: boolean) {
    const basePayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      client_id: user.client_id ?? null,
    };

    const refreshTokenId = randomUUID();
    const refreshTtl = parseDurationToSeconds(
      String(this.refreshTokenExpiresIn),
    );
    await this.persistRefreshAllowlistOrThrow(
      refreshTokenId,
      user.id,
      refreshTtl,
    );

    const accessPayload: AuthTokenPayload = {
      ...basePayload,
      type: "access",
    };
    const refreshPayload: AuthTokenPayload = {
      ...basePayload,
      type: "refresh",
      jti: refreshTokenId,
      remember,
    };

    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(accessPayload, {
          secret: this.accessTokenSecret,
          expiresIn: this.accessTokenExpiresIn,
        }),
        this.jwtService.signAsync(refreshPayload, {
          secret: this.refreshTokenSecret,
          expiresIn: this.refreshTokenExpiresIn,
        }),
      ]);

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
      };
    } catch (err) {
      try {
        await this.redisService.client.del(
          this.getRefreshTokenKey(refreshTokenId),
        );
      } catch {
        /* noop — limpeza best-effort */
      }
      throw err;
    }
  }

  /** Falla fechado: não emite JWT de refresh antes da allowlist estar persistida. */
  private async persistRefreshAllowlistOrThrow(
    refreshTokenId: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.getRefreshTokenKey(refreshTokenId);
    try {
      const outcome = await this.redisService.client.set(
        key,
        userId,
        "EX",
        ttlSeconds,
      );
      if (outcome !== "OK") {
        throw new Error(`Redis SET retornou ${String(outcome)}`);
      }
    } catch (err) {
      this.logger.error(
        `Falha ao persistir refresh em Redis: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        "Nao foi possivel criar sessao no momento. Servico temporariamente indisponivel — tente novamente.",
      );
    }
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        refreshToken,
        {
          secret: this.refreshTokenSecret,
        },
      );

      if (payload.type !== "refresh" || !payload.jti) {
        throw new UnauthorizedException("Refresh token invalido");
      }

      return payload;
    } catch {
      throw new UnauthorizedException("Refresh token invalido");
    }
  }

  private getRefreshTokenKey(jti: string) {
    return `auth:refresh:${jti}`;
  }

  private getPasswordResetTokenKey(token: string) {
    return `auth:password-reset:${token}`;
  }

  /**
   * Primeira senha do vendedor aprovado. Ao contrario do reset, NAO exige
   * `password_hash` presente — e justamente para quem ainda nao tem senha.
   */
  async getPasswordSetupPreview(token: string) {
    const userId = await this.passwordSetup.peekSetupToken(token.trim());
    if (!userId) {
      throw new NotFoundException("Link invalido, expirado ou ja utilizado");
    }

    const user = await this.usersService
      .getEntityById(userId)
      .catch(() => null);
    if (!user || !user.is_active || user.approval_status !== "approved") {
      throw new NotFoundException("Link invalido, expirado ou ja utilizado");
    }

    return { first_name: user.name.trim().split(/\s+/)[0] || user.name };
  }

  async setupPassword(dto: SetupPasswordDto) {
    const userId = await this.passwordSetup.consumeSetupToken(
      dto.setup_token.trim(),
    );
    if (!userId) {
      throw new BadRequestException("Link invalido, expirado ou ja utilizado");
    }

    const user = await this.usersService.getEntityById(userId);
    if (!user.is_active || user.approval_status !== "approved") {
      throw new UnauthorizedException("Cadastro nao esta ativo.");
    }

    const passwordHash = await bcrypt.hash(
      dto.new_password,
      BCRYPT_SALT_ROUNDS,
    );
    await this.usersService.updatePasswordHash(user.id, passwordHash);
    await this.revokeRefreshTokensForUser(user.id);

    // Sem auto-login de proposito: a pessoa segue para a tela de login.
    return { message: "Senha criada com sucesso. Faca login para entrar." };
  }

  private getFailedLoginKey(email: string) {
    return `auth:login-fail:${email}`;
  }

  private async assertLoginAllowed(email: string) {
    const key = this.getFailedLoginKey(email);
    let attemptsRaw: string | null;
    try {
      attemptsRaw = await this.redisService.client.get(key);
    } catch {
      this.logger.warn(
        "Redis indisponivel ao checar tentativas de login; " +
          `limite temporariamente DESATIVADO ate o Redis normalizar.`,
      );
      return;
    }
    const attempts = Number(attemptsRaw ?? 0);
    if (
      Number.isFinite(attempts) &&
      attempts >= AuthService.loginRateLimitMaxAttempts
    ) {
      throw new HttpException(
        "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async registerFailedLogin(email: string) {
    const key = this.getFailedLoginKey(email);
    try {
      const prev = await this.redisService.client.get(key);
      const n = Number(prev ?? 0);
      const next = (Number.isFinite(n) ? n : 0) + 1;
      await this.redisService.client.set(
        key,
        String(next),
        "EX",
        AuthService.loginRateLimitWindowSeconds,
      );
    } catch (err) {
      this.logger.warn(
        `Redis indisponivel ao registrar falha de login: ${(err as Error).message}`,
      );
    }
  }

  private async clearFailedLoginAttempts(email: string) {
    try {
      await this.redisService.client.del(this.getFailedLoginKey(email));
    } catch (err) {
      this.logger.warn(
        `Redis indisponivel ao limpar falhas de login: ${(err as Error).message}`,
      );
    }
  }

  private shouldExposePasswordResetToken() {
    return (
      process.env.NODE_ENV !== "production" ||
      this.configService.get<string>("ALLOW_PASSWORD_RESET_TOKEN_RESPONSE") ===
        "true"
    );
  }

  private async revokeRefreshTokensForUser(userId: string) {
    const client = this.redisService.client;
    try {
      let cursor = "0";
      const keysToDelete: string[] = [];

      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          "MATCH",
          "auth:refresh:*",
          "COUNT",
          "100",
        );
        cursor = nextCursor;

        if (!keys.length) {
          continue;
        }

        const storedValues = await Promise.all(
          keys.map((key) => client.get(key)),
        );
        keys.forEach((key, index) => {
          if (storedValues[index] === userId) {
            keysToDelete.push(key);
          }
        });
      } while (cursor !== "0");

      if (keysToDelete.length > 0) {
        await client.del(...keysToDelete);
      }
    } catch (err) {
      this.logger.error(
        `Falha ao revogar refresh tokens Redis: ${(err as Error).message}`,
      );
    }
  }
}

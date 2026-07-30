import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { RedisService } from "../../config/redis.service";

/**
 * Token de PRIMEIRA senha (onboarding de vendedor aprovado).
 *
 * Namespace proprio, separado do reset de senha, por dois motivos:
 * - o reset exige `password_hash` presente; aqui o usuario ainda nao tem senha;
 * - a janela e maior (a pessoa pode demorar a abrir o e-mail).
 *
 * Compensacoes: token opaco, uso unico, entregue so por e-mail, sem auto-login,
 * e revoga as sessoes existentes ao ser consumido.
 */
export const PASSWORD_SETUP_TTL_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class PasswordSetupService {
  private readonly logger = new Logger(PasswordSetupService.name);

  constructor(private readonly redis: RedisService) {}

  private key(token: string): string {
    return `auth:password-setup:${token}`;
  }

  async issueSetupToken(userId: string): Promise<string> {
    const token = randomUUID();
    try {
      await this.redis.client.set(
        this.key(token),
        userId,
        "EX",
        PASSWORD_SETUP_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error(
        `Redis indisponivel ao emitir token de criacao de senha: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        "Nao foi possivel gerar o link de criacao de senha.",
      );
    }
    return token;
  }

  /** Le sem consumir — a tela mostra o primeiro nome antes de a pessoa enviar. */
  async peekSetupToken(token: string): Promise<string | null> {
    try {
      return await this.redis.client.get(this.key(token));
    } catch {
      return null;
    }
  }

  /** Uso unico: le e apaga na mesma chamada. */
  async consumeSetupToken(token: string): Promise<string | null> {
    const redisKey = this.key(token);
    try {
      const userId = await this.redis.client.get(redisKey);
      if (userId) {
        await this.redis.client.del(redisKey);
      }
      return userId;
    } catch (err) {
      this.logger.error(
        `Redis indisponivel ao consumir token de criacao de senha: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        "Nao foi possivel validar o link. Tente novamente.",
      );
    }
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../config/prisma.service";

@Injectable()
export class IntegrationCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(gestorId: string, clientId: string) {
    await this.assertOwnedClient(gestorId, clientId);
    const rows = await this.prisma.integrationCredential.findMany({
      where: { client_id: clientId },
      orderBy: { created_at: "desc" },
    });
    return rows.map((row) => this.serialize(row));
  }

  async create(
    gestorId: string,
    clientId: string,
    input: { name: string; expires_at?: string },
  ) {
    await this.assertOwnedClient(gestorId, clientId);
    const expiresAt = this.parseFutureExpiration(input.expires_at);
    const plaintext = this.generateKey();
    const row = await this.prisma.integrationCredential.create({
      data: {
        client_id: clientId,
        name: input.name.trim(),
        key_prefix: plaintext.slice(0, 20),
        key_hash: this.hashKey(plaintext),
        expires_at: expiresAt,
      },
    });
    return { ...this.serialize(row), key: plaintext };
  }

  async rotate(gestorId: string, clientId: string, credentialId: string) {
    await this.assertOwnedClient(gestorId, clientId);
    const current = await this.prisma.integrationCredential.findFirst({
      where: { id: credentialId, client_id: clientId },
    });
    if (!current) {
      throw new NotFoundException("Credencial de integracao nao encontrada");
    }

    const plaintext = this.generateKey();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.integrationCredential.update({
        where: { id: current.id },
        data: { revoked_at: current.revoked_at ?? new Date() },
      });
      return tx.integrationCredential.create({
        data: {
          client_id: clientId,
          name: current.name,
          key_prefix: plaintext.slice(0, 20),
          key_hash: this.hashKey(plaintext),
          expires_at: current.expires_at,
        },
      });
    });
    return { ...this.serialize(row), key: plaintext };
  }

  async revoke(gestorId: string, clientId: string, credentialId: string) {
    await this.assertOwnedClient(gestorId, clientId);
    const credential = await this.prisma.integrationCredential.findFirst({
      where: { id: credentialId, client_id: clientId },
    });
    if (!credential) {
      throw new NotFoundException("Credencial de integracao nao encontrada");
    }
    const row = await this.prisma.integrationCredential.update({
      where: { id: credential.id },
      data: { revoked_at: credential.revoked_at ?? new Date() },
    });
    return this.serialize(row);
  }

  /** Gestor e papel global: valida existencia da empresa, nao propriedade. */
  private async assertOwnedClient(
    _gestorId: string,
    clientId: string,
  ): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException("Cliente nao encontrado");
    }
  }

  private generateKey(): string {
    return `lfi_${randomBytes(32).toString("base64url")}`;
  }

  private hashKey(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private parseFutureExpiration(value?: string): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException(
        "A expiracao da credencial deve estar no futuro",
      );
    }
    return date;
  }

  private serialize(row: {
    id: string;
    client_id: string;
    name: string;
    key_prefix: string;
    created_at: Date;
    expires_at: Date | null;
    revoked_at: Date | null;
    last_used_at: Date | null;
  }) {
    return {
      id: row.id,
      client_id: row.client_id,
      name: row.name,
      key_prefix: row.key_prefix,
      created_at: row.created_at.toISOString(),
      expires_at: row.expires_at?.toISOString() ?? null,
      revoked_at: row.revoked_at?.toISOString() ?? null,
      last_used_at: row.last_used_at?.toISOString() ?? null,
    };
  }
}

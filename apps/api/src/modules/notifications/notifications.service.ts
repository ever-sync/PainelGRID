import { Injectable, Logger } from "@nestjs/common";
import { NotificationType, Role as PrismaRole } from "@prisma/client";
import { PrismaService } from "../../config/prisma.service";
import { AuthenticatedUser } from "../auth/auth.types";

/** Quanto a central guarda por pessoa; o excedente é podado na escrita. */
const MAX_PER_USER = 100;
const DEFAULT_PAGE = 50;

export type NotificationTarget = "chat" | "leads";

export type NotificationInput = {
  clientId: string;
  type: NotificationType;
  title: string;
  description: string;
  /**
   * Para onde a notificação leva. Guardamos o destino, não a URL: cada perfil
   * tem uma rota diferente para o mesmo lugar, e quem recebe define qual é.
   */
  target?: NotificationTarget;
  /** Restringe a entrega a estes usuários; vazio = toda a equipe da empresa. */
  userIds?: string[];
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a notificação para cada destinatário. Nunca lança: notificação é
   * efeito colateral de outra ação (um check-in, uma venda) e não pode
   * derrubar a operação que a originou.
   */
  async notifyClientTeam(input: NotificationInput): Promise<number> {
    try {
      const team = await this.resolveClientTeam(input.clientId);
      const recipients = input.userIds?.length
        ? team.filter((member) => input.userIds?.includes(member.id))
        : team;
      if (recipients.length === 0) return 0;

      const created = await this.prisma.notification.createMany({
        data: recipients.map((member) => ({
          client_id: input.clientId,
          user_id: member.id,
          type: input.type,
          title: input.title.slice(0, 160),
          description: input.description.slice(0, 500),
          href: input.target
            ? NotificationsService.routeFor(member.role, input.target)
            : null,
        })),
      });

      await this.pruneOldest(recipients.map((member) => member.id));
      return created.count;
    } catch (error) {
      this.logger.warn(
        `Falha ao gravar notificacao: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /** Equipe da empresa + o gestor dono dela, com o papel de cada um. */
  private async resolveClientTeam(
    clientId: string,
  ): Promise<Array<{ id: string; role: PrismaRole }>> {
    const [staff, client] = await Promise.all([
      this.prisma.user.findMany({
        where: { client_id: clientId, is_active: true },
        select: { id: true, role: true },
      }),
      this.prisma.client.findUnique({
        where: { id: clientId },
        select: { gestor: { select: { id: true, role: true } } },
      }),
    ]);

    const byId = new Map(staff.map((user) => [user.id, user]));
    if (client?.gestor) byId.set(client.gestor.id, client.gestor);
    return Array.from(byId.values());
  }

  /**
   * Mantém a caixa em MAX_PER_USER. Sem isto, um usuário antigo acumularia
   * milhares de linhas que ninguém lê.
   */
  private async pruneOldest(userIds: string[]) {
    for (const userId of userIds) {
      const total = await this.prisma.notification.count({
        where: { user_id: userId },
      });
      if (total <= MAX_PER_USER) continue;

      const excedente = await this.prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        skip: MAX_PER_USER,
        select: { id: true },
      });
      if (excedente.length === 0) continue;
      await this.prisma.notification.deleteMany({
        where: { id: { in: excedente.map((row) => row.id) } },
      });
    }
  }

  async findForUser(user: AuthenticatedUser, take = DEFAULT_PAGE) {
    const rows = await this.prisma.notification.findMany({
      where: { user_id: user.sub },
      orderBy: { created_at: "desc" },
      take: Math.min(Math.max(take, 1), MAX_PER_USER),
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        href: row.href,
        read: row.read_at !== null,
        created_at: row.created_at,
      })),
      unread_count: await this.prisma.notification.count({
        where: { user_id: user.sub, read_at: null },
      }),
    };
  }

  /** Marca uma notificação como lida. Silencioso se não for do usuário. */
  async markRead(user: AuthenticatedUser, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, user_id: user.sub, read_at: null },
      data: { read_at: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(user: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({
      where: { user_id: user.sub, read_at: null },
      data: { read_at: new Date() },
    });
    return { updated: result.count };
  }

  async clear(user: AuthenticatedUser) {
    const result = await this.prisma.notification.deleteMany({
      where: { user_id: user.sub },
    });
    return { deleted: result.count };
  }

  /** Rota do painel por perfil — o mesmo destino tem caminho diferente. */
  static routeFor(
    role: PrismaRole | string,
    target: "chat" | "leads",
  ): string | null {
    const byRole: Record<string, { chat: string | null; leads: string }> = {
      gestor: { chat: "/gestor/chat", leads: "/gestor/crm" },
      cliente: { chat: "/cliente/conversas", leads: "/cliente/leads" },
      vendedor: { chat: "/vendedor/chat", leads: "/vendedor/leads" },
      recepcao: { chat: null, leads: "/recepcao/checkin" },
    };
    return byRole[String(role).toLowerCase()]?.[target] ?? null;
  }
}

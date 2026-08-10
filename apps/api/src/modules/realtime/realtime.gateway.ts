import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthTokenPayload } from "../auth/auth.types";
import { Role } from "../../common/types";
import {
  normalizeWebOrigin,
  parseAllowedOrigins,
} from "../../config/cors-origins";
import { ClientsService } from "../clients/clients.service";

@WebSocketGateway({
  namespace: "/realtime",
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly allowedOrigins: Set<string>;
  private static readonly onlineUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly clientsService: ClientsService,
  ) {
    this.allowedOrigins = new Set(
      parseAllowedOrigins(
        this.configService.get<string>("FRONTEND_URL"),
        "http://localhost:5173",
      ),
    );
  }

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    try {
      const origin = this.extractOrigin(client);
      if (!origin || !this.allowedOrigins.has(normalizeWebOrigin(origin))) {
        throw new Error("Origin nao autorizada");
      }

      const token = this.extractTokenFromSocket(client);
      if (!token) {
        throw new Error("Nenhum token fornecido");
      }

      const secret = this.configService.get<string>(
        "JWT_SECRET",
        "leadflow_access_secret",
      );
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        token,
        { secret },
      );

      if (payload.type !== "access") {
        throw new Error("Tipo de token invalido");
      }

      client.data.user = payload;

      const requestedClientId = client.handshake.query.client_id;
      const normalizedRequestedClientId =
        this.normalizeClientId(requestedClientId);
      if (requestedClientId !== undefined && !normalizedRequestedClientId) {
        throw new Error("client_id invalido");
      }
      const clientId = normalizedRequestedClientId || payload.client_id;
      if (clientId) {
        await this.assertClientAccess(payload, clientId);
        await client.join(this.room(clientId));
        this.trackAuthorizedClient(client, clientId);

        let set = RealtimeGateway.onlineUsers.get(clientId);
        if (!set) {
          set = new Set();
          RealtimeGateway.onlineUsers.set(clientId, set);
        }
        set.add(payload.sub);

        // Envia a lista para todos na sala da empresa
        this.server
          .to(this.room(clientId))
          .emit("online_vendors", Array.from(set));
      }
    } catch {
      this.logger.warn("Desconectando socket por falha de autenticacao");
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const payload = client.data.user as AuthTokenPayload | undefined;
    const authorizedClientIds = client.data.authorizedClientIds as
      string[] | undefined;
    if (!payload || !authorizedClientIds) {
      return;
    }

    for (const clientId of authorizedClientIds) {
      const set = RealtimeGateway.onlineUsers.get(clientId);
      if (set) {
        set.delete(payload.sub);
        this.server
          .to(this.room(clientId))
          .emit("online_vendors", Array.from(set));
      }
    }
  }

  @SubscribeMessage("join_client")
  async joinClient(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { client_id?: string },
  ) {
    const payload = client.data.user as AuthTokenPayload | undefined;
    if (!payload) {
      return { ok: false };
    }

    const clientId = this.normalizeClientId(body?.client_id);
    if (!clientId) {
      return { ok: false };
    }

    if (!(await this.canAccessClient(payload, clientId))) {
      return { ok: false };
    }

    await client.join(this.room(clientId));
    this.trackAuthorizedClient(client, clientId);

    let set = RealtimeGateway.onlineUsers.get(clientId);
    if (!set) {
      set = new Set();
      RealtimeGateway.onlineUsers.set(clientId, set);
    }
    set.add(payload.sub);

    this.server.to(this.room(clientId)).emit("online_vendors", Array.from(set));
    return { ok: true };
  }

  emitToClient(
    clientId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    this.server.to(this.room(clientId)).emit(event, payload);
  }

  isUserOnline(clientId: string, userId: string): boolean {
    return RealtimeGateway.onlineUsers.get(clientId)?.has(userId) ?? false;
  }

  getOnlineUserIds(clientId: string): string[] {
    return Array.from(RealtimeGateway.onlineUsers.get(clientId) ?? []);
  }

  private room(clientId: string) {
    return `client:${clientId}`;
  }

  private trackAuthorizedClient(client: Socket, clientId: string): void {
    const current = client.data.authorizedClientIds as string[] | undefined;
    client.data.authorizedClientIds = Array.from(
      new Set([...(current ?? []), clientId]),
    );
  }

  private normalizeClientId(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
      ? trimmed
      : null;
  }

  private extractTokenFromSocket(client: Socket): string | undefined {
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    return undefined;
  }

  private async assertClientAccess(
    payload: AuthTokenPayload,
    clientId: string,
  ): Promise<void> {
    if (payload.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(payload.sub, clientId);
      return;
    }
    if (payload.client_id !== clientId) {
      throw new Error("Acesso negado a este client_id");
    }
  }

  private async canAccessClient(
    payload: AuthTokenPayload,
    clientId: string,
  ): Promise<boolean> {
    try {
      await this.assertClientAccess(payload, clientId);
      return true;
    } catch {
      return false;
    }
  }

  private extractOrigin(client: Socket): string | undefined {
    const headerOrigin = client.handshake.headers.origin;
    if (typeof headerOrigin === "string") return headerOrigin;
    if (Array.isArray(headerOrigin)) return headerOrigin[0];
    return undefined;
  }
}

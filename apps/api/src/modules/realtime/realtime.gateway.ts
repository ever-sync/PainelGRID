import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthTokenPayload } from '../auth/auth.types';
import { Role } from '../../common/types';
import { normalizeWebOrigin, parseAllowedOrigins } from '../../config/cors-origins';

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly allowedOrigins: Set<string>;
  private static readonly onlineUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.allowedOrigins = new Set(
      parseAllowedOrigins(this.configService.get<string>('FRONTEND_URL'), 'http://localhost:5173'),
    );
  }

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    try {
      const origin = this.extractOrigin(client);
      if (!origin || !this.allowedOrigins.has(normalizeWebOrigin(origin))) {
        throw new Error('Origin nao autorizada');
      }

      const token = this.extractTokenFromSocket(client);
      if (!token) {
        throw new Error('Nenhum token fornecido');
      }

      const secret = this.configService.get<string>('JWT_SECRET', 'leadflow_access_secret');
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token, { secret });

      if (payload.type !== 'access') {
        throw new Error('Tipo de token invalido');
      }

      client.data.user = payload;

      const clientId = this.normalizeClientId(client.handshake.query.client_id) || payload.client_id;
      if (clientId) {
        if (payload.role !== Role.GESTOR && payload.client_id !== clientId) {
          throw new Error('Acesso negado a este client_id');
        }
        void client.join(this.room(clientId));

        let set = RealtimeGateway.onlineUsers.get(clientId);
        if (!set) {
          set = new Set();
          RealtimeGateway.onlineUsers.set(clientId, set);
        }
        set.add(payload.sub);

        // Envia a lista para todos na sala da empresa
        this.server.to(this.room(clientId)).emit('online_vendors', Array.from(set));
      }
    } catch (error) {
      this.logger.warn(`Desconectando socket. Falha de autenticacao: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const payload = client.data.user as AuthTokenPayload | undefined;
    if (payload) {
      const clientId = this.normalizeClientId(client.handshake.query.client_id) || payload.client_id;
      if (clientId) {
        const set = RealtimeGateway.onlineUsers.get(clientId);
        if (set) {
          set.delete(payload.sub);
          this.server.to(this.room(clientId)).emit('online_vendors', Array.from(set));
        }
      }
    }
  }

  @SubscribeMessage('join_client')
  async joinClient(@ConnectedSocket() client: Socket, @MessageBody() body: { client_id?: string }) {
    const payload = client.data.user as AuthTokenPayload | undefined;
    if (!payload) {
      return { ok: false };
    }

    const clientId = this.normalizeClientId(body?.client_id);
    if (!clientId) {
      return { ok: false };
    }

    if (payload.role !== Role.GESTOR && payload.client_id !== clientId) {
      return { ok: false };
    }

    await client.join(this.room(clientId));

    let set = RealtimeGateway.onlineUsers.get(clientId);
    if (!set) {
      set = new Set();
      RealtimeGateway.onlineUsers.set(clientId, set);
    }
    set.add(payload.sub);

    this.server.to(this.room(clientId)).emit('online_vendors', Array.from(set));
    return { ok: true };
  }

  emitToClient(clientId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(this.room(clientId)).emit(event, payload);
  }

  private room(clientId: string) {
    return `client:${clientId}`;
  }

  private normalizeClientId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private extractTokenFromSocket(client: Socket): string | undefined {
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    if (typeof client.handshake.query.token === 'string') {
      return client.handshake.query.token;
    }
    return undefined;
  }

  private extractOrigin(client: Socket): string | undefined {
    const headerOrigin = client.handshake.headers.origin;
    if (typeof headerOrigin === 'string') return headerOrigin;
    if (Array.isArray(headerOrigin)) return headerOrigin[0];
    return undefined;
  }
}

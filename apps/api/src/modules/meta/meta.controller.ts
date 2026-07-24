import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { parseAllowedOrigins } from '../../config/cors-origins';
import { AuthenticatedUser } from '../auth/auth.types';
import { DisconnectMetaDto } from './dto/disconnect-meta.dto';
import { ListMetaBusinessesQueryDto } from './dto/list-meta-businesses-query.dto';
import { MetaCallbackQueryDto } from './dto/meta-callback-query.dto';
import { SelectMetaAssetsDto } from './dto/select-meta-assets.dto';
import { ImportMetaLeadsDto } from './dto/import-meta-leads.dto';
import { StartMetaConnectDto } from './dto/start-meta-connect.dto';
import { TriggerMetaSyncDto } from './dto/trigger-meta-sync.dto';
import { MetaService } from './meta.service';

@ApiTags('meta')
@ApiBearerAuth()
@Controller('meta')
export class MetaController {
  constructor(
    private readonly metaService: MetaService,
    private readonly configService: ConfigService,
  ) {}

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Post('connect/start')
  @ApiOperation({ summary: 'Inicia fluxo de conexão OAuth com Meta' })
  @ApiResponse({ status: 201, description: 'Fluxo iniciado com sucesso' })
  startConnect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartMetaConnectDto,
  ): Promise<Record<string, unknown>> {
    return this.metaService.startConnect(user, dto);
  }

  @Roles(Role.GESTOR)
  @Post('gestor/connect/start')
  @ApiOperation({ summary: 'Inicia conexão Meta no escopo do gestor' })
  @ApiResponse({ status: 201, description: 'Fluxo iniciado com sucesso' })
  startGestorConnect(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.metaService.startGestorConnect(user);
  }

  @Roles(Role.GESTOR)
  @Get('gestor/status')
  @ApiOperation({ summary: 'Retorna status da conexão Meta do gestor' })
  @ApiResponse({ status: 200, description: 'Status retornado com sucesso' })
  getGestorMetaStatus(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.metaService.getGestorMetaStatus(user);
  }

  @Roles(Role.GESTOR)
  @Post('gestor/disconnect')
  @ApiOperation({ summary: 'Desconecta integração Meta do gestor' })
  @ApiResponse({ status: 201, description: 'Desconexão concluída com sucesso' })
  disconnectGestor(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.metaService.disconnectGestor(user);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('connect/callback')
  @ApiOperation({ summary: 'Recebe callback OAuth da Meta' })
  @ApiResponse({ status: 200, description: 'Callback processado com sucesso' })
  handleCallback(@Query() query: MetaCallbackQueryDto): Promise<Record<string, unknown>> {
    return this.metaService.handleCallback(query);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('connect/callback/window')
  @ApiOperation({ summary: 'Renderiza callback OAuth para popup de autenticação' })
  @ApiResponse({ status: 200, description: 'Página de callback renderizada' })
  async handleCallbackWindow(
    @Query() query: MetaCallbackQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const payload = await this.metaService.handleCallback(query);
      response
        .status(200)
        .type('html')
        .send(
          this.renderOauthWindowHtml({ type: 'meta_oauth_result', status: 'success', ...payload }),
        );
      return;
    } catch (error) {
      const message = this.resolveErrorMessage(error);
      response
        .status(200)
        .type('html')
        .send(
          this.renderOauthWindowHtml({
            type: 'meta_oauth_result',
            status: 'error',
            message,
          }),
        );
    }
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Get('businesses')
  @ApiOperation({ summary: 'Lista negócios/contas da Meta disponíveis' })
  @ApiResponse({ status: 200, description: 'Negócios listados com sucesso' })
  listBusinesses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMetaBusinessesQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.metaService.listBusinesses(user, query);
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Post('select-assets')
  @ApiOperation({ summary: 'Seleciona ativos Meta para integração' })
  @ApiResponse({ status: 201, description: 'Ativos selecionados com sucesso' })
  selectAssets(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectMetaAssetsDto,
  ): Promise<Record<string, unknown>> {
    return this.metaService.selectAssets(user, dto);
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Get('status/:clientId')
  @ApiOperation({ summary: 'Retorna status de integração Meta por cliente' })
  @ApiResponse({ status: 200, description: 'Status retornado com sucesso' })
  getStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ): Promise<Record<string, unknown>> {
    return this.metaService.getStatus(user, clientId);
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Get('summary/:clientId')
  @ApiOperation({ summary: 'Retorna resumo de campanhas/leads da Meta por cliente' })
  @ApiResponse({ status: 200, description: 'Resumo retornado com sucesso' })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ): Promise<Record<string, unknown>> {
    return this.metaService.getSummary(user, clientId);
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Get('campaigns-report/:clientId')
  @ApiOperation({
    summary: 'Relatorio hierarquico Campanha -> Conjunto -> Anuncio com metricas agregadas',
  })
  @ApiResponse({ status: 200, description: 'Relatorio retornado com sucesso' })
  getCampaignsReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ): Promise<Record<string, unknown>> {
    return this.metaService.getCampaignsReport(user, clientId);
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Post('sync/full')
  @ApiOperation({ summary: 'Dispara sincronização completa da integração Meta' })
  @ApiResponse({ status: 201, description: 'Sincronização disparada com sucesso' })
  syncFull(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TriggerMetaSyncDto,
  ): Promise<Record<string, unknown>> {
    return this.metaService.syncFull(user, dto);
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Post('sync/leads')
  @ApiOperation({ summary: 'Importa leads antigos dos formularios Meta selecionados' })
  @ApiResponse({ status: 201, description: 'Importação disparada com sucesso' })
  importHistoricalLeads(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportMetaLeadsDto,
  ): Promise<Record<string, unknown>> {
    return this.metaService.importHistoricalLeads(user, dto);
  }

  @Roles(Role.GESTOR, Role.CLIENTE)
  @Post('disconnect')
  @ApiOperation({ summary: 'Desconecta integração Meta de um cliente' })
  @ApiResponse({ status: 201, description: 'Desconexão concluída com sucesso' })
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisconnectMetaDto,
  ): Promise<Record<string, unknown>> {
    return this.metaService.disconnect(user, dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('webhook')
  @ApiOperation({ summary: 'Valida webhook da Meta (handshake)' })
  @ApiResponse({ status: 200, description: 'Webhook validado com sucesso' })
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    if (
      (verifyToken?.length ?? 0) > 512 ||
      (challenge?.length ?? 0) > 2048 ||
      (mode?.length ?? 0) > 32
    ) {
      throw new PayloadTooLargeException('Parametros do webhook excedem o limite');
    }
    return this.metaService.verifyWebhook(mode, verifyToken, challenge);
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post('webhook')
  @ApiOperation({ summary: 'Recebe eventos de webhook da Meta' })
  @ApiResponse({ status: 201, description: 'Evento recebido com sucesso' })
  receiveWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-hub-signature-256') signature?: string,
    @Req() request?: RawBodyRequest<Request>,
  ): Promise<Record<string, unknown>> {
    if (!request?.rawBody || request.rawBody.length > 1024 * 1024) {
      throw new PayloadTooLargeException('Payload do webhook ausente ou acima de 1 MiB');
    }
    return this.metaService.receiveWebhook(payload, signature, request?.rawBody);
  }

  private renderOauthWindowHtml(payload: Record<string, unknown>) {
    const serializedPayload = JSON.stringify(payload).replace(/</g, '\\u003c');
    const allowedOrigins = parseAllowedOrigins(
      this.configService.get<string>('FRONTEND_URL'),
      'http://localhost:5173',
    );
    const serializedOrigins = JSON.stringify(allowedOrigins).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Integração Meta</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: #faf7f2;
        color: #18181b;
      }
      .card {
        width: min(480px, 92vw);
        border: 1px solid #e8dece;
        border-radius: 20px;
        padding: 20px;
        background: white;
        box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);
      }
      .title {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 700;
      }
      .text {
        margin: 0;
        font-size: 14px;
        color: #52525b;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="title">Conexão Meta concluída</h1>
      <p class="text">Esta janela será fechada automaticamente em instantes.</p>
    </div>
    <script>
      const payload = ${serializedPayload};
      const allowedOrigins = ${serializedOrigins};
      if (window.opener && !window.opener.closed) {
        for (const origin of allowedOrigins) {
          try {
            window.opener.postMessage(payload, origin);
          } catch (err) {
            /* origem incompativel: o browser ignora, seguimos para a proxima */
          }
        }
      }
      setTimeout(() => window.close(), 800);
    </script>
  </body>
</html>`;
  }

  private resolveErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: unknown }).response;
      if (typeof response === 'string' && response.trim().length > 0) {
        return response;
      }
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
          return message;
        }
        if (Array.isArray(message) && typeof message[0] === 'string') {
          return message[0];
        }
      }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'Falha ao concluir autorização da Meta.';
  }
}

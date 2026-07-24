import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { ConversationsService } from './conversations.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { EnsureConversationDto } from './dto/ensure-conversation.dto';
import { FindConversationsQueryDto } from './dto/find-conversations-query.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Lista conversas filtradas pelo cliente do usuário' })
  @ApiResponse({ status: 200, description: 'Conversas retornadas com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão para listar conversas' })
  findAll(@Query() query: FindConversationsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.findAll(user, query);
  }

  @Post('ensure')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Garante conversa para um lead/canal' })
  @ApiResponse({ status: 201, description: 'Conversa existente ou criada com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão para o cliente informado' })
  @ApiResponse({ status: 404, description: 'Lead não encontrado para o cliente informado' })
  ensure(@Body() dto: EnsureConversationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.ensureConversation(user, dto);
  }

  @Get(':id/messages')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Lista mensagens de uma conversa' })
  @ApiResponse({ status: 200, description: 'Mensagens retornadas com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão para esta conversa' })
  @ApiResponse({ status: 404, description: 'Conversa não encontrada' })
  messages(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.findMessages(user, id);
  }

  @Get('messages/:messageId/media')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Entrega a midia de uma mensagem WhatsApp autenticada pela API' })
  async messageMedia(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const media = await this.conversationsService.downloadMessageMedia(user, messageId);
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${media.filename.replace(/"/g, '')}"`);
    res.send(media.buffer);
  }

  @Get(':id/agent-actions')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Lista ações do agente para uma conversa' })
  @ApiResponse({ status: 200, description: 'Ações retornadas com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  agentActions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.findAgentActions(user, id);
  }

  @Post(':id/messages')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Envia nova mensagem em uma conversa' })
  @ApiResponse({ status: 201, description: 'Mensagem registrada com sucesso' })
  @ApiResponse({ status: 400, description: 'Conteúdo inválido' })
  @ApiResponse({ status: 403, description: 'Sem permissão para enviar nesta conversa' })
  addMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.addMessage(user, id, dto);
  }

  @Post(':id/media')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Envia arquivo/foto/video em uma conversa WhatsApp' })
  @ApiResponse({ status: 201, description: 'Mídia enviada com sucesso' })
  addMediaMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file?.buffer || !file.originalname || !file.mimetype) {
      throw new BadRequestException('Arquivo inválido para envio.');
    }

    return this.conversationsService.addMediaMessage(user, id, {
      fileBuffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      caption,
    });
  }
}

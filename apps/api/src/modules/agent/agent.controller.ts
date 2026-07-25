import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { IntegrationKeyGuard } from '../integration/integration-key.guard';
import { AgentActionLogService } from './agent-action-log.service';
import { AgentService } from './agent.service';
import { ConversationStateService } from './conversation-state.service';
import { CreateAgentActionLogDto } from './dto/create-agent-action-log.dto';
import { GetAgentEventsAvailabilityQueryDto } from './dto/get-agent-events-availability-query.dto';
import { GetAgentWhatsappContextQueryDto } from './dto/get-agent-whatsapp-context-query.dto';
import { RequestConversationHandoffDto } from './dto/request-conversation-handoff.dto';
import { UpdateConversationStateDto } from './dto/update-conversation-state.dto';

@ApiTags('agent')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Leadflow-Integration-Key', required: true })
@Controller('agent')
@Public()
@UseGuards(IntegrationKeyGuard)
@Throttle({ default: { limit: 600, ttl: 60000 } })
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly conversationStateService: ConversationStateService,
    private readonly agentActionLogService: AgentActionLogService,
  ) {}

  @Get('whatsapp/context')
  @ApiOperation({ summary: 'Retorna contexto WhatsApp para o agente' })
  @ApiResponse({ status: 200, description: 'Contexto retornado com sucesso' })
  getWhatsappContext(@Query() query: GetAgentWhatsappContextQueryDto) {
    return this.agentService.getWhatsappContext(query);
  }

  @Get('events/availability')
  @ApiOperation({ summary: 'Retorna disponibilidade de eventos para o agente' })
  @ApiResponse({ status: 200, description: 'Disponibilidade retornada com sucesso' })
  getEventsAvailability(@Query() query: GetAgentEventsAvailabilityQueryDto) {
    return this.agentService.getEventsAvailability(query);
  }

  @Post('conversations/:id/state')
  @ApiOperation({ summary: 'Atualiza estado de uma conversa' })
  @ApiResponse({ status: 201, description: 'Estado atualizado com sucesso' })
  updateConversationState(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateConversationStateDto,
  ) {
    return this.conversationStateService.updateState(id, dto);
  }

  @Post('conversations/:id/action-logs')
  @ApiOperation({ summary: 'Registra ação do agente em uma conversa' })
  @ApiResponse({ status: 201, description: 'Ação registrada com sucesso' })
  createActionLog(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateAgentActionLogDto,
  ) {
    return this.agentActionLogService.createActionLog(id, dto);
  }

  @Post('conversations/:id/handoff')
  @ApiOperation({ summary: 'Solicita handoff para atendimento humano' })
  @ApiResponse({ status: 201, description: 'Handoff solicitado com sucesso' })
  requestConversationHandoff(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RequestConversationHandoffDto,
  ) {
    return this.agentActionLogService.requestHandoff(id, dto);
  }
}

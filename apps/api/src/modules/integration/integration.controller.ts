import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { CrmService } from '../crm/crm.service';
import { MoveLeadBySuffixDto } from '../crm/dto/move-lead-by-suffix.dto';
import { MoveLeadDto } from '../crm/dto/move-lead.dto';
import { EventsService } from '../events/events.service';
import { CreateLeadDto } from '../leads/dto/create-lead.dto';
import { FindLeadsQueryDto } from '../leads/dto/find-leads-query.dto';
import { IntegrationPatchLeadDto } from '../leads/dto/integration-patch-lead.dto';
import { ReconcileLeadsDto } from '../leads/dto/reconcile-leads.dto';
import { LeadsService } from '../leads/leads.service';
import { IntegrationFindEventQueryDto } from './dto/find-event-query.dto';
import { IntegrationKeyGuard } from './integration-key.guard';
import { RubinhoService } from '../rubinho/rubinho.service';

@ApiTags('integrations')
@Controller('integrations/v1')
@Public()
@UseGuards(IntegrationKeyGuard)
@Throttle({ default: { limit: 600, ttl: 60000 } })
@ApiHeader({ name: 'X-Leadflow-Integration-Key', required: true })
export class IntegrationController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly crmService: CrmService,
    private readonly eventsService: EventsService,
    private readonly rubinhoService: RubinhoService,
  ) {}

  @Get('events')
  @ApiOperation({
    summary: 'Lista eventos do cliente via integração externa',
    description:
      'Retorna eventos do cliente filtrados por janela de datas. ' +
      'Ideal para automações que verificam eventos nas próximas 24h.',
  })
  @ApiResponse({ status: 200, description: 'Eventos retornados com sucesso' })
  @ApiQuery({ name: 'client_id', required: true, description: 'UUID do cliente (obrigatório)' })
  @ApiQuery({ name: 'date_from', required: false, description: 'ISO 8601 — eventos a partir desta data' })
  @ApiQuery({ name: 'date_to', required: false, description: 'ISO 8601 — eventos até esta data' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtra por status do evento' })
  listEvents(
    @Query('client_id') clientId: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('status') status?: string,
  ) {
    return this.eventsService.findForIntegration({ clientId, dateFrom, dateTo, status });
  }

  @Get('events/:id')
  @ApiOperation({
    summary: 'Busca evento por ID via integração externa',
    description:
      'Retorna os dados completos do evento (nome, datas, local, capacidade, ' +
      'imagens, status e contadores). Use o parâmetro opcional `client_id` para ' +
      'validar que o evento pertence à empresa informada — caso não pertença, ' +
      'a API retorna 404.',
  })
  @ApiResponse({ status: 200, description: 'Evento encontrado' })
  @ApiResponse({ status: 404, description: 'Evento não encontrado' })
  @ApiQuery({
    name: 'client_id',
    required: false,
    description: 'UUID do cliente para validar que o evento pertence a ele',
  })
  getEvent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: IntegrationFindEventQueryDto,
  ) {
    return this.eventsService.findOneForIntegration(id, query.client_id);
  }

  @Get('leads')
  @ApiOperation({
    summary: 'Lista leads via integração externa',
    description:
      'Retorna lista paginada de leads do cliente. Suporta filtros por evento, ' +
      'status de confirmação, fonte, busca por nome/telefone/email e intervalo de datas. ' +
      'Use `cursor` para paginar — o próximo cursor vem em `page_info.next_cursor`.',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de leads' })
  @ApiQuery({ name: 'client_id', required: true, description: 'UUID do cliente (obrigatório)' })
  @ApiQuery({
    name: 'event_id',
    required: false,
    description: 'Filtra leads vinculados a este evento (UUID)',
  })
  @ApiQuery({
    name: 'confirmation_status',
    required: false,
    description: 'Filtra por status: pending | scheduled | confirmed | cancelled | checked_in',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Busca por nome, e-mail ou telefone (parcial, insensível a maiúsculas)',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Filtra pela origem do lead (ex: whatsapp)',
  })
  @ApiQuery({
    name: 'created_after',
    required: false,
    description: 'ISO 8601 — retorna leads criados a partir desta data/hora',
  })
  @ApiQuery({
    name: 'updated_after',
    required: false,
    description: 'ISO 8601 — retorna leads atualizados a partir desta data/hora',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'UUID do último lead da página anterior (paginação)',
  })
  @ApiQuery({
    name: 'take',
    required: false,
    description: 'Quantidade de itens por página (1–200, padrão 50)',
  })
  listLeads(@Query() query: FindLeadsQueryDto) {
    return this.leadsService.findAllForIntegration(query);
  }

  @Post('leads')
  @ApiOperation({
    summary: 'Cria lead via integração externa (com deduplicação automática)',
    description:
      'Se já existir um lead ativo com o mesmo telefone ou e-mail para o mesmo cliente, ' +
      'retorna o lead existente com `already_existed: true` sem criar duplicata. ' +
      'Nesse caso, se o lead ainda não tiver `event_interest_id`, `crm_pipeline_id` ou ' +
      '`crm_stage_id`, esses campos são atualizados com os valores do request. ' +
      'Quando criado pela primeira vez, retorna o lead com `already_existed: false`.',
  })
  @ApiResponse({
    status: 201,
    description: 'Lead criado ou encontrado. Campo `already_existed` indica se já existia.',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou evento/pipeline não pertencem ao cliente',
  })
  createLead(@Body() dto: CreateLeadDto) {
    return this.leadsService.createForIntegration(dto);
  }

  @Post('leads/reconcile')
  @ApiOperation({
    summary: 'Reconcilia leads do cliente com a fonte externa (arquiva órfãos)',
    description:
      'Recebe a lista de telefones que AINDA existem na fonte externa (ex.: Bitrix) ' +
      'em `keep_phones`. Leads ativos do cliente cujo telefone não está na lista são ' +
      'arquivados (soft-delete). Leads de origem `manual` e sem telefone são preservados. ' +
      'Use `dry_run: true` para simular sem apagar. Ideal para um fluxo agendado que ' +
      'busca todos os deals do Bitrix e envia os telefones aqui.',
  })
  @ApiResponse({ status: 201, description: 'Reconciliação concluída (ou simulada com dry_run)' })
  reconcileLeads(@Body() dto: ReconcileLeadsDto) {
    return this.leadsService.reconcileLeadsForIntegration(dto);
  }

  @Patch('leads/:id')
  @ApiOperation({
    summary: 'Atualiza lead via integração externa',
    description:
      'Atualiza campos do lead. Ao mudar `confirmation_status` para `confirmed`, ' +
      'a API gera automaticamente o token de check-in e envia o QR Code por WhatsApp ' +
      'para o número do lead (usando o canal WhatsApp configurado para o cliente). ' +
      'Valores de `confirmation_status`: pending | scheduled | confirmed | cancelled | checked_in.',
  })
  @ApiResponse({ status: 200, description: 'Lead atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Telefone já cadastrado para outro lead' })
  @ApiResponse({ status: 404, description: 'Lead não encontrado' })
  patchLead(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: IntegrationPatchLeadDto) {
    return this.leadsService.patchLeadForIntegration(id, dto);
  }

  @Post('leads/:id/crm/move')
  @ApiOperation({
    summary: 'Move lead de etapa no CRM via integração externa',
    description:
      'Move o lead para uma etapa do CRM usando os códigos de pipeline e etapa (slugs). ' +
      'Use o header `Idempotency-Key` para evitar movimentações duplicadas em caso de retry.',
  })
  @ApiResponse({ status: 201, description: 'Movimentação processada com sucesso' })
  @ApiResponse({ status: 404, description: 'Lead, pipeline ou etapa não encontrados' })
  moveLead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MoveLeadDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.crmService.moveLeadByIntegration(id, dto, idempotencyKey);
  }

  @Post('leads/:id/crm/move-by-suffix')
  @ApiOperation({
    summary: 'Move lead no CRM usando apenas o sufixo da etapa (para uso pela IA)',
    description:
      'Endpoint simplificado que aceita apenas o sufixo da etapa (ex: EM_CONTATO, ' +
      'PRESENCA_AGENDADA) e resolve automaticamente o pipeline_code e stage_code ' +
      'completos a partir dos dados do lead. Sufixos válidos: NOVO_LEAD, TENTATIVA_CONTATO, ' +
      'EM_CONTATO, PRE_AGENDAMENTO, PRESENCA_AGENDADA, ENVIAR_CONFIRMACAO, AGENDADOS_CONFIRMADOS, ' +
      'PRESENCA_REAGENDADA, PRESENCA_CANCELADA, LEMBRETE, DESINTERESSE, ' +
      'RECUPERACAO_VENDA, RECUPERACAO_PRESENCA, RECUPERACAO_RESPONDIDA, ' +
      'PRESENCA_CONFIRMADA, LEAD_PERDIDO, LEAD_AUSENTE, ATENDIMENTO_ENCERRADO, ' +
      'FEEDBACK, RESPONDEU_FEEDBACK.',
  })
  @ApiResponse({ status: 201, description: 'Movimentação processada com sucesso' })
  @ApiResponse({ status: 404, description: 'Lead ou etapa não encontrados' })
  moveLeadBySuffix(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MoveLeadBySuffixDto,
  ) {
    return this.crmService.moveLeadBySuffix(id, dto.stage_suffix, dto.notes, dto.source);
  }

  @Post('leads/:id/crm/stage/:suffix')
  @ApiOperation({
    summary: 'Move lead no CRM usando o sufixo no path da URL (uso simplificado pela IA)',
    description:
      'Endpoint alternativo que aceita o sufixo diretamente na URL. Exemplo: POST /api/integrations/v1/leads/{id}/crm/stage/EM_CONTATO',
  })
  @ApiResponse({ status: 201, description: 'Movimentação processada com sucesso' })
  @ApiResponse({ status: 404, description: 'Lead ou etapa não encontrados' })
  moveLeadBySuffixPath(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('suffix') suffix: string,
  ) {
    return this.crmService.moveLeadBySuffix(id, suffix, undefined, 'rubinho_ai_path');
  }
  @Get('rubinho/config')
  @ApiOperation({
    summary: 'Retorna a configuração ativa do Rubinho vinculada a um evento ou lead',
    description:
      'Retorna o prompt do sistema, tom de voz, delay, FAQs e documentos do agente Rubinho ativo ' +
      'associado ao event_id ou lead_id informado.',
  })
  @ApiResponse({ status: 200, description: 'Configuração do Rubinho retornada com sucesso' })
  @ApiResponse({ status: 400, description: 'Parâmetros inválidos' })
  @ApiResponse({ status: 404, description: 'Robô ou evento não encontrado' })
  @ApiQuery({ name: 'event_id', required: false, description: 'UUID do evento para buscar o robô' })
  @ApiQuery({ name: 'lead_id', required: false, description: 'UUID do lead para buscar o robô' })
  @ApiQuery({
    name: 'include_knowledge',
    required: false,
    description: 'Se deve incluir FAQs e documentos na resposta',
  })
  getRubinhoConfig(
    @Query('event_id') eventId?: string,
    @Query('lead_id') leadId?: string,
    @Query('include_knowledge') includeKnowledge?: string,
  ) {
    const shouldIncludeKnowledge = includeKnowledge === 'true';
    return this.rubinhoService.getRubinhoConfigForIntegration(
      eventId,
      leadId,
      shouldIncludeKnowledge,
    );
  }
}

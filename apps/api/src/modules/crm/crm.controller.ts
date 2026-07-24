import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { CrmService } from './crm.service';
import { CleanupIdempotencyDto } from './dto/cleanup-idempotency.dto';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { FindPipelinesQueryDto } from './dto/find-pipelines-query.dto';
import { GetDashboardReportQueryDto } from './dto/get-dashboard-report-query.dto';
import { BulkMoveLeadsDto } from './dto/bulk-move-leads.dto';
import { MoveLeadDto } from './dto/move-lead.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('pipelines')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Lista pipelines de CRM' })
  @ApiResponse({ status: 200, description: 'Pipelines retornados com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso restrito ao gestor' })
  findPipelines(@Query() query: FindPipelinesQueryDto) {
    return this.crmService.findPipelines(query);
  }

  @Get('reports/dashboard')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Retorna relatório de dashboard do CRM' })
  @ApiResponse({ status: 200, description: 'Relatório retornado com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso restrito ao gestor' })
  getDashboardReport(@Query() query: GetDashboardReportQueryDto) {
    return this.crmService.getDashboardReport(query);
  }

  @Get('leads/stage-counts')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Contagem real de leads por etapa do CRM' })
  @ApiResponse({ status: 200, description: 'Contagens retornadas com sucesso' })
  getLeadStageCounts(
    @Query('client_id', new ParseUUIDPipe()) clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crmService.getLeadStageCounts(clientId, user);
  }

  @Get('pipelines/code/:code')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Busca pipeline por código' })
  @ApiResponse({ status: 200, description: 'Pipeline encontrado' })
  @ApiResponse({ status: 404, description: 'Pipeline não encontrado' })
  findPipelineByCode(@Param('code') code: string) {
    return this.crmService.findPipelineByCode(code);
  }

  @Get('pipelines/:id')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Busca pipeline por ID' })
  @ApiResponse({ status: 200, description: 'Pipeline encontrado' })
  @ApiResponse({ status: 404, description: 'Pipeline não encontrado' })
  findPipelineById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crmService.findPipelineById(id);
  }

  @Post('pipelines')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Cria pipeline de CRM' })
  @ApiBody({ type: CreatePipelineDto })
  @ApiResponse({ status: 201, description: 'Pipeline criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  createPipeline(@Body() dto: CreatePipelineDto) {
    return this.crmService.createPipeline(dto);
  }

  @Get('pipelines/:pipelineId/stages')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Lista estágios de um pipeline' })
  @ApiResponse({ status: 200, description: 'Estágios retornados com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  findStagesByPipelineId(
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crmService.findStagesByPipelineId(pipelineId, user);
  }

  @Post('pipelines/:pipelineId/stages')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Cria estágio em pipeline' })
  @ApiBody({ type: CreateStageDto })
  @ApiResponse({ status: 201, description: 'Estágio criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  createStage(
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
    @Body() dto: CreateStageDto,
  ) {
    return this.crmService.createStage(pipelineId, dto);
  }

  @Get('stages/code/:code')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Busca estágio por código' })
  @ApiResponse({ status: 200, description: 'Estágio encontrado' })
  @ApiResponse({ status: 404, description: 'Estágio não encontrado' })
  findStageByCode(@Param('code') code: string) {
    return this.crmService.findStageByCode(code);
  }

  @Get('leads/:leadId/history')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Retorna histórico de movimentações do lead no CRM' })
  @ApiResponse({ status: 200, description: 'Histórico retornado com sucesso' })
  @ApiResponse({ status: 404, description: 'Lead não encontrado' })
  getLeadHistory(
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crmService.getLeadHistory(leadId, user);
  }

  @Get('leads/:leadId/timeline')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Retorna a linha do tempo completa do lead (todos os eventos)' })
  @ApiResponse({ status: 200, description: 'Timeline retornada com sucesso' })
  @ApiResponse({ status: 404, description: 'Lead não encontrado' })
  getLeadTimeline(
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crmService.getLeadTimeline(leadId, user);
  }

  @Post('leads/:leadId/move')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Move lead entre etapas do CRM' })
  @ApiBody({ type: MoveLeadDto })
  @ApiResponse({ status: 201, description: 'Lead movido com sucesso' })
  @ApiResponse({ status: 400, description: 'Movimentação inválida' })
  @ApiResponse({ status: 403, description: 'Sem permissão para mover lead' })
  @ApiResponse({ status: 404, description: 'Lead/pipeline/etapa não encontrado' })
  moveLead(
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Body() dto: MoveLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.crmService.moveLeadByCodes(leadId, dto, user.sub, idempotencyKey, user);
  }

  @Post('leads/bulk-move')
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @ApiOperation({ summary: 'Move múltiplos leads para a mesma etapa' })
  @ApiBody({ type: BulkMoveLeadsDto })
  @ApiResponse({ status: 201, description: 'Resultado do bulk move' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Pipeline/etapa não encontrado' })
  bulkMoveLeads(@Body() dto: BulkMoveLeadsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.crmService.bulkMoveLeads(dto, user);
  }

  @Post('idempotency/cleanup')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Limpa registros de idempotência antigos' })
  @ApiResponse({ status: 201, description: 'Limpeza executada com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso restrito ao gestor' })
  cleanupIdempotency(@Query() query: CleanupIdempotencyDto) {
    return this.crmService.cleanupIdempotencyRequests(query);
  }
}

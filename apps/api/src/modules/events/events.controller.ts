import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreateEventDto } from "./dto/create-event.dto";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import { FindEventsQueryDto } from "./dto/find-events-query.dto";
import { OperationalReportQueryDto } from "./dto/operational-report-query.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventDashboardService } from "./event-dashboard.service";
import { EventsService } from "./events.service";

@ApiTags("events")
@ApiBearerAuth()
@Controller("events")
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventDashboardService: EventDashboardService,
  ) {}

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Lista eventos acessíveis ao usuário" })
  @ApiResponse({ status: 200, description: "Eventos retornados com sucesso" })
  @ApiResponse({ status: 401, description: "Não autenticado" })
  @ApiResponse({
    status: 403,
    description: "Sem permissão para listar eventos",
  })
  findAll(
    @Query() query: FindEventsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.findAll(user, query);
  }

  @Get("audit-logs")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Lista o histórico de auditoria por cliente ou evento" })
  getAuditLogs(
    @Query() query: AuditLogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.getAuditLogs(user, query);
  }

  @Get("active-summary")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({
    summary:
      "Retorna funil compacto de todos os eventos ativos acessiveis ao usuario",
    description:
      'Para o card "Eventos ativos" do dashboard geral: leads/agendados/confirmados/' +
      "check-in/vendidos por evento ativo, sem o detalhamento de vendedores/times/vendas.",
  })
  @ApiResponse({ status: 200, description: "Resumo retornado com sucesso" })
  getActiveEventsSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.eventDashboardService.getActiveEventsSummary(user);
  }

  @Get("reports/operational")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({
    summary: "Relatório operacional agregado e paginado",
    description:
      "Contrato de dados do relatório enxuto do gestor. Agrega leads no backend e devolve a lista paginada usando os mesmos filtros.",
  })
  @ApiResponse({ status: 200, description: "Relatório operacional" })
  @ApiResponse({ status: 403, description: "Cliente ou evento fora do escopo" })
  getOperationalReport(
    @Query() query: OperationalReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventDashboardService.getOperationalReport(user, query);
  }

  @Get(":id/dashboard-tv")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({
    summary: "Retorna o snapshot completo do dashboard TV de um evento",
    description:
      "Agrega funil, ranking de vendedores, ranking de equipes, vendas por segmento, " +
      "top modelos, série diária (leads/agendados/confirmados/check-in/vendas) e " +
      "comparecimento por canal. Pensado para polling de TV ao vivo durante o evento.",
  })
  @ApiResponse({ status: 200, description: "Snapshot do dashboard TV" })
  @ApiResponse({ status: 403, description: "Sem permissão" })
  @ApiResponse({ status: 404, description: "Evento não encontrado" })
  getDashboardTv(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventDashboardService.getTvDashboard(user, id);
  }

  @Get(":id/executive-report")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({
    summary: "Relatório executivo do evento",
    description:
      "Atribuição real campanha→venda (via MetaLeadImport), analytics do Rubinho e " +
      "histórico dos eventos anteriores do cliente. Alimenta o Relatório Executivo.",
  })
  @ApiResponse({ status: 200, description: "Relatório executivo do evento" })
  @ApiResponse({ status: 403, description: "Sem permissão" })
  @ApiResponse({ status: 404, description: "Evento não encontrado" })
  getExecutiveReport(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventDashboardService.getExecutiveReport(user, id);
  }

  @Get(":id")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Retorna detalhe de um evento com estatísticas" })
  @ApiResponse({ status: 200, description: "Evento retornado com sucesso" })
  @ApiResponse({ status: 401, description: "Não autenticado" })
  @ApiResponse({ status: 403, description: "Sem permissão" })
  @ApiResponse({ status: 404, description: "Evento não encontrado" })
  findOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.findOne(user, id);
  }

  @Post()
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Cria novo evento para o cliente" })
  @ApiResponse({ status: 201, description: "Evento criado com sucesso" })
  @ApiResponse({ status: 400, description: "Dados inválidos" })
  @ApiResponse({ status: 403, description: "Apenas gestor/cliente pode criar" })
  create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.create(user, dto);
  }

  @Patch(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Atualiza evento" })
  @ApiResponse({ status: 200, description: "Evento atualizado com sucesso" })
  @ApiResponse({ status: 400, description: "Dados inválidos" })
  @ApiResponse({
    status: 403,
    description: "Apenas gestor/cliente pode atualizar",
  })
  @ApiResponse({ status: 404, description: "Evento não encontrado" })
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({
    summary: "Exclui evento e desvincula seus registros dependentes",
  })
  @ApiResponse({ status: 200, description: "Evento excluído com sucesso" })
  @ApiResponse({ status: 403, description: "Sem permissão" })
  @ApiResponse({ status: 404, description: "Evento não encontrado" })
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.remove(user, id);
  }
}

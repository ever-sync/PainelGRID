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
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { CheckLeadPhoneDto } from "./dto/check-lead-phone.dto";
import { CheckInByTokenDto } from "./dto/check-in-by-token.dto";
import { CloseAttendanceDto } from "./dto/close-attendance.dto";
import { CallVendorDto } from "./dto/call-vendor.dto";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { FindLeadsQueryDto } from "./dto/find-leads-query.dto";
import { ImportLeadsDto } from "./dto/import-leads.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { UpdateVendorStatusDto } from "./dto/update-vendor-status.dto";
import { LeadsService } from "./leads.service";
import { spreadsheetUploadOptions } from "../../common/upload-options";

@ApiTags("leads")
@ApiBearerAuth()
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get("export")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  @ApiOperation({ summary: "Exporta leads filtrados em CSV" })
  @ApiResponse({ status: 200, description: "CSV gerado com sucesso" })
  @ApiResponse({ status: 403, description: "Sem permissão para exportar" })
  async exportCsv(
    @Query() query: FindLeadsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const csv = await this.leadsService.exportCsv(user, query);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"leads-${stamp}.csv\"`,
    );
    res.status(200).send(csv);
  }

  @Post("import")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @UseInterceptors(FileInterceptor("file", spreadsheetUploadOptions))
  @ApiOperation({ summary: "Importa leads via arquivo CSV ou XLSX" })
  @ApiResponse({ status: 201, description: "Importação processada" })
  @ApiResponse({ status: 400, description: "Arquivo inválido ou ausente" })
  @ApiResponse({ status: 403, description: "Sem permissão para importar" })
  importCsv(
    @UploadedFile()
    file:
      { buffer: Buffer; originalname?: string; mimetype?: string } | undefined,
    @Body() dto: ImportLeadsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.importCsv(user, dto, file);
  }

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Lista leads com filtros e paginação por cursor" })
  @ApiResponse({ status: 200, description: "Leads retornados com sucesso" })
  @ApiResponse({ status: 403, description: "Sem permissão" })
  findAll(
    @Query() query: FindLeadsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.findAll(user, query);
  }

  @Get("reception-queue")
  @Roles(Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Lista enxuta da fila de atendimento do evento" })
  @ApiResponse({ status: 200, description: "Fila retornada com sucesso" })
  getReceptionQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.getReceptionQueue(user);
  }

  @Get("check-phone")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({
    summary:
      "Verifica se telefone já existe para o cliente e evento informados",
  })
  @ApiResponse({ status: 200, description: "Checagem executada com sucesso" })
  @ApiResponse({ status: 400, description: "Telefone inválido" })
  checkPhone(
    @Query() query: CheckLeadPhoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.checkPhone(
      user,
      query.phone,
      query.client_id,
      query.event_id,
    );
  }

  @Get("lookup")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({
    summary: "Busca leads por CPF ou Telefone para auto-preenchimento",
  })
  lookup(@Query("q") q: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.lookupByCpfOrPhone(user, q);
  }

  @Post("check-in-by-token")
  @Roles(Role.RECEPCAO, Role.VENDEDOR, Role.GESTOR)
  @ApiOperation({ summary: "Realiza check-in de lead por token/voucher" })
  @ApiResponse({ status: 201, description: "Check-in efetuado com sucesso" })
  @ApiResponse({
    status: 403,
    description: "Acesso permitido apenas para recepção, vendedor ou gestor",
  })
  @ApiResponse({
    status: 404,
    description: "Token inválido ou lead não encontrado",
  })
  checkInByToken(
    @Body() dto: CheckInByTokenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.checkInByToken(user, dto.token);
  }

  @Get("fipe/:plate")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Consulta dados FIPE do veículo pela placa" })
  @ApiResponse({ status: 200, description: "Dados retornados com sucesso" })
  getFipeData(
    @Param("plate") plate: string,
    @Query("event_id") eventId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.getFipeDataPublic(plate, user, eventId);
  }

  @Get("vendor-availability")
  @Roles(Role.RECEPCAO, Role.GESTOR, Role.CLIENTE, Role.VENDEDOR)
  listVendorAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.listVendorAvailability(user);
  }

  @Get("vendor-attendance/current")
  @Roles(Role.VENDEDOR)
  currentVendorAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.currentVendorAttendance(user);
  }

  @Patch("vendor-status")
  @Roles(Role.VENDEDOR)
  updateVendorStatus(
    @Body() dto: UpdateVendorStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.updateVendorStatus(user, dto.status);
  }

  @Get(":id")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Busca lead por ID" })
  @ApiResponse({ status: 200, description: "Lead encontrado" })
  @ApiResponse({ status: 403, description: "Sem permissão para este lead" })
  @ApiResponse({ status: 404, description: "Lead não encontrado" })
  findOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.findOne(user, id);
  }

  @Post()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Cria novo lead" })
  @ApiResponse({ status: 201, description: "Lead criado com sucesso" })
  @ApiResponse({ status: 400, description: "Dados inválidos" })
  @ApiResponse({
    status: 403,
    description: "Sem permissão para o cliente informado",
  })
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.create(user, dto);
  }

  @Post(":id/assign-to-me")
  @Roles(Role.VENDEDOR)
  @ApiOperation({
    summary: "Atribui lead sem vendedor e sem evento ao vendedor autenticado",
  })
  @ApiResponse({ status: 200, description: "Lead atribuído com sucesso" })
  @ApiResponse({
    status: 400,
    description: "Lead já possui vendedor ou já está vinculado a um evento",
  })
  @ApiResponse({ status: 403, description: "Sem permissão para este lead" })
  @ApiResponse({ status: 404, description: "Lead não encontrado" })
  assignToMe(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.assignToMe(user, id);
  }

  @Post(":id/close-attendance")
  @Roles(Role.VENDEDOR, Role.GESTOR, Role.CLIENTE, Role.RECEPCAO)
  @ApiOperation({
    summary:
      "Encerra o atendimento do lead e move para a etapa Atendimento Encerrado",
  })
  @ApiResponse({
    status: 200,
    description: "Atendimento encerrado com sucesso",
  })
  @ApiResponse({
    status: 400,
    description:
      "CPF e, quando exigido pelo evento, número da pulseira são obrigatórios na baixa completa",
  })
  @ApiResponse({ status: 403, description: "Sem permissão para este lead" })
  @ApiResponse({ status: 404, description: "Lead não encontrado" })
  closeAttendance(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CloseAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.closeAttendance(user, id, dto);
  }

  @Post(":id/call-vendor")
  @Roles(Role.RECEPCAO, Role.GESTOR)
  @ApiOperation({
    summary: "Notifica o vendedor vinculado que o cliente chegou (TV)",
  })
  @ApiResponse({ status: 200, description: "Vendedor notificado com sucesso" })
  @ApiResponse({ status: 400, description: "Lead não tem vendedor vinculado" })
  @ApiResponse({ status: 403, description: "Sem permissão" })
  @ApiResponse({ status: 404, description: "Lead não encontrado" })
  callVendor(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CallVendorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.callVendor(user, id, dto);
  }

  @Post(":id/accept-vendor-call")
  @Roles(Role.VENDEDOR)
  acceptVendorCall(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.acceptVendorCall(user, id);
  }

  @Post(":id/reject-vendor-call")
  @Roles(Role.VENDEDOR)
  @ApiOperation({
    summary: "Recusa a chamada e encaminha o lead ao próximo vendedor",
  })
  rejectVendorCall(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.rejectVendorCall(user, id);
  }

  @Post(":id/expire-vendor-call")
  @Roles(Role.VENDEDOR, Role.RECEPCAO, Role.GESTOR)
  expireVendorCall(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.expireVendorCall(user, id);
  }

  @Patch(":id")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Atualiza lead por ID" })
  @ApiResponse({ status: 200, description: "Lead atualizado com sucesso" })
  @ApiResponse({
    status: 400,
    description: "Atualização inválida para o papel atual",
  })
  @ApiResponse({
    status: 403,
    description: "Sem permissão para atualizar este lead",
  })
  @ApiResponse({ status: 404, description: "Lead não encontrado" })
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Exclui lead por ID" })
  @ApiResponse({ status: 200, description: "Lead excluído com sucesso" })
  @ApiResponse({
    status: 403,
    description: "Sem permissão para excluir este lead",
  })
  @ApiResponse({ status: 404, description: "Lead não encontrado" })
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.remove(user, id);
  }
}

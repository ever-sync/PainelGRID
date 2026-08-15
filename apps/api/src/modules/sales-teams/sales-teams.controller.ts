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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { AddTeamMemberDto } from "./dto/add-member.dto";
import { CreateSalesTeamDto } from "./dto/create-sales-team.dto";
import { UpdateSalesTeamDto } from "./dto/update-sales-team.dto";
import { ReorderMembersDto } from "./dto/reorder-members.dto";
import { SalesTeamsService } from "./sales-teams.service";

@ApiTags("sales-teams")
@ApiBearerAuth()
@Controller("sales-teams")
@Roles(Role.GESTOR, Role.CLIENTE)
export class SalesTeamsController {
  constructor(private readonly service: SalesTeamsService) {}

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.RECEPCAO)
  @ApiQuery({ name: "event_id", required: false })
  @ApiQuery({ name: "client_id", required: false })
  @ApiOperation({ summary: "Lista times de vendas do evento ou cliente" })
  @ApiResponse({ status: 200, description: "Times retornados com sucesso" })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("event_id") eventId?: string,
    @Query("client_id") clientId?: string,
  ) {
    return this.service.findAll(user, eventId, clientId);
  }

  @Post()
  @ApiQuery({ name: "event_id", required: false })
  @ApiQuery({ name: "client_id", required: false })
  @ApiOperation({ summary: "Cria novo time comercial dentro de um evento" })
  @ApiResponse({ status: 201, description: "Time criado com sucesso" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Query("event_id") eventId: string | undefined,
    @Query("client_id") clientId: string | undefined,
    @Body() dto: CreateSalesTeamDto,
  ) {
    return this.service.create(user, eventId, clientId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Atualiza nome ou logo do time comercial" })
  @ApiResponse({ status: 200, description: "Time atualizado com sucesso" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSalesTeamDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Remove time comercial por ID" })
  @ApiResponse({ status: 200, description: "Time removido com sucesso" })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.remove(user, id);
  }

  @Post(":id/members")
  @ApiOperation({ summary: "Adiciona membro ao time comercial" })
  @ApiResponse({ status: 201, description: "Membro adicionado com sucesso" })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.service.addMember(user, id, dto);
  }

  @Delete(":id/members/:userId")
  @ApiOperation({ summary: "Remove membro do time comercial" })
  @ApiResponse({ status: 200, description: "Membro removido com sucesso" })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    return this.service.removeMember(user, id, userId);
  }

  @Patch(":id/members/order")
  @ApiOperation({ summary: "Reordena a fila de vendedores do time" })
  reorderMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderMembersDto,
  ) {
    return this.service.reorderMembers(user, id, dto);
  }
}

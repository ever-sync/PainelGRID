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
import { CreateSaleDto } from "./dto/create-sale.dto";
import { CreateQuickSaleDto } from "./dto/create-quick-sale.dto";
import { UpdateSaleDto } from "./dto/update-sale.dto";
import { SalesService } from "./sales.service";

@ApiTags("sales")
@ApiBearerAuth()
@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get("mine")
  @Roles(Role.VENDEDOR)
  @ApiOperation({ summary: "Lista vendas do vendedor autenticado" })
  @ApiResponse({ status: 200, description: "Vendas retornadas com sucesso" })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.salesService.listMine(user);
  }

  @Get()
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: "Lista todas as vendas de um evento" })
  listByEvent(
    @Query("event_id", new ParseUUIDPipe()) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.listByEvent(user, eventId);
  }

  @Get("buyers")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.RECEPCAO)
  @ApiOperation({ summary: "Busca compradores para a venda rápida" })
  listBuyers(
    @Query("client_id", new ParseUUIDPipe()) clientId: string,
    @Query("search") search: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.listBuyers(user, clientId, search);
  }

  @Get("pending")
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: "Lista atendimentos com venda aguardando baixa" })
  listPendingByEvent(
    @Query("event_id", new ParseUUIDPipe()) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.listPendingByEvent(user, eventId);
  }

  @Post()
  @Roles(Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Cria uma nova venda" })
  @ApiResponse({ status: 201, description: "Venda criada com sucesso" })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.create(user, dto);
  }

  @Post("quick")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.RECEPCAO)
  @ApiOperation({
    summary: "Registra venda rápida pelo gestor, cliente ou recepção",
  })
  quickSale(
    @Body() dto: CreateQuickSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.createQuickSale(user, dto);
  }

  @Patch(":id")
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: "Atualiza uma venda registrada" })
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: "Exclui uma venda registrada" })
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.remove(user, id);
  }
}

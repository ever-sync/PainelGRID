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
import { VehiclesService } from "./vehicles.service";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";
import { SyncVehicleCatalogDto } from "./dto/sync-vehicle-catalog.dto";
import { ImportVehicleCatalogDto } from "./dto/import-vehicle-catalog.dto";
import { FindVehiclesQueryDto } from "./dto/find-vehicles-query.dto";
import { BulkUpdateVehicleStatusDto } from "./dto/bulk-update-vehicle-status.dto";

@ApiTags("vehicles")
@ApiBearerAuth()
@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.RECEPCAO)
  @ApiOperation({ summary: "Cria um novo veículo" })
  @ApiResponse({ status: 201, description: "Veículo criado com sucesso" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehiclesService.create(user, dto);
  }

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.RECEPCAO)
  @ApiOperation({ summary: "Lista os veículos do cliente com filtros" })
  @ApiResponse({ status: 200, description: "Veículos listados com sucesso" })
  @ApiQuery({ name: "client_id", required: true })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "tag", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "take", required: false })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindVehiclesQueryDto,
  ) {
    return this.vehiclesService.findAll(user, query.client_id, query);
  }

  @Post("catalog/sync")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Sincroniza o catálogo FIPE da marca do cliente" })
  syncCatalog(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncVehicleCatalogDto,
  ) {
    return this.vehiclesService.syncCatalog(user, dto.client_id);
  }

  @Post("catalog/import")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Importa modelos do catálogo para o estoque" })
  importCatalog(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportVehicleCatalogDto,
  ) {
    return this.vehiclesService.importCatalog(user, dto);
  }

  @Patch("bulk-status")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Ativa ou desativa vários veículos" })
  bulkUpdateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkUpdateVehicleStatusDto,
  ) {
    return this.vehiclesService.bulkUpdateStatus(user, dto);
  }

  @Get(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Busca os detalhes de um veículo" })
  @ApiResponse({ status: 200, description: "Veículo encontrado" })
  @ApiResponse({ status: 404, description: "Veículo não encontrado" })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.vehiclesService.findOne(user, id);
  }

  @Patch(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Atualiza um veículo" })
  @ApiResponse({ status: 200, description: "Veículo atualizado com sucesso" })
  @ApiResponse({ status: 404, description: "Veículo não encontrado" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: "Exclui um veículo" })
  @ApiResponse({ status: 200, description: "Veículo excluído com sucesso" })
  @ApiResponse({ status: 404, description: "Veículo não encontrado" })
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.vehiclesService.delete(user, id);
  }
}

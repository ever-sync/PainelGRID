import { Body, Controller, Get, Post } from "@nestjs/common";
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

  @Post()
  @Roles(Role.VENDEDOR)
  @ApiOperation({ summary: "Cria uma nova venda" })
  @ApiResponse({ status: 201, description: "Venda criada com sucesso" })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.create(user, dto);
  }
}

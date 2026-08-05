import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { ClientsService } from "../clients/clients.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { ServiceRatingsService } from "./service-ratings.service";

@ApiTags("service-ratings")
@ApiBearerAuth()
@Controller("service-ratings")
export class ServiceRatingsController {
  constructor(
    private readonly serviceRatings: ServiceRatingsService,
    private readonly clientsService: ClientsService,
  ) {}

  @Get("summary")
  @Roles(Role.VENDEDOR)
  @ApiOperation({
    summary: "Retorna resumo de avaliacoes de atendimento do vendedor",
  })
  @ApiResponse({ status: 200, description: "Resumo retornado com sucesso" })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.serviceRatings.summaryForVendor(user.sub);
  }

  @Get("vendor/:vendorId")
  @Roles(Role.GESTOR)
  @ApiOperation({
    summary: "Retorna perfil completo de avaliacoes/metricas de um vendedor",
  })
  @ApiResponse({ status: 200, description: "Perfil retornado com sucesso" })
  @ApiResponse({
    status: 403,
    description: "Sem permissao sobre este vendedor",
  })
  @ApiResponse({ status: 404, description: "Vendedor nao encontrado" })
  async vendorProfile(
    @Param("vendorId") vendorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const vendor = await this.serviceRatings.findVendorBasicInfo(vendorId);
    if (!vendor || vendor.role !== Role.VENDEDOR || !vendor.client_id) {
      throw new NotFoundException("Vendedor nao encontrado");
    }
    await this.clientsService.assertGestorOwnsClient(
      user.sub,
      vendor.client_id,
    );

    return this.serviceRatings.vendorProfileForGestor(vendorId);
  }
}

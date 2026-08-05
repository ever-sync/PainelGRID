import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
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
import { VendorScoreRankingQueryDto } from "./dto/vendor-score-ranking-query.dto";
import { ScoreEventsService } from "./score-events.service";

@ApiTags("vendor-score")
@ApiBearerAuth()
@Controller("vendor")
export class VendorScoreController {
  constructor(
    private readonly scoreEvents: ScoreEventsService,
    private readonly clientsService: ClientsService,
  ) {}

  @Get("score-summary")
  @Roles(Role.VENDEDOR)
  @ApiOperation({ summary: "Retorna resumo de pontuação do vendedor" })
  @ApiResponse({ status: 200, description: "Resumo retornado com sucesso" })
  summary(@CurrentUser() user: AuthenticatedUser) {
    if (!user.client_id) {
      return {
        vendor_id: user.sub,
        client_id: null,
        total_points: 0,
        scheduled: { points: 0, count: 0 },
        checked_in: { points: 0, count: 0 },
        sold: { points: 0, count: 0 },
      };
    }

    return this.scoreEvents.summaryForVendor(user.sub, user.client_id);
  }

  @Get("score-ranking")
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: "Retorna ranking de pontuação dos vendedores" })
  @ApiResponse({ status: 200, description: "Ranking retornado com sucesso" })
  async ranking(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: VendorScoreRankingQueryDto,
  ) {
    const clientId = await this.resolveClientIdForRanking(
      user,
      query.client_id,
    );
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return this.scoreEvents.rankingForClient({
      clientId,
      eventId: query.event_id,
      from,
      to,
      limit: query.limit,
    });
  }

  private async resolveClientIdForRanking(
    user: AuthenticatedUser,
    queryClientId?: string,
  ) {
    if (user.role === Role.GESTOR) {
      if (!queryClientId) {
        throw new BadRequestException("Gestor deve informar client_id");
      }
      await this.clientsService.assertGestorOwnsClient(user.sub, queryClientId);
      return queryClientId;
    }

    if (!user.client_id) {
      throw new BadRequestException("Usuario sem empresa vinculada");
    }

    if (queryClientId && queryClientId !== user.client_id) {
      throw new BadRequestException("client_id invalido");
    }

    return user.client_id;
  }
}

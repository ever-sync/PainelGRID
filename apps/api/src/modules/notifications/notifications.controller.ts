import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { NotificationsService } from "./notifications.service";

/** Todo perfil autenticado tem a própria central. */
const ALL_ROLES = [
  Role.GESTOR,
  Role.CLIENTE,
  Role.VENDEDOR,
  Role.RECEPCAO,
] as const;

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Lista as notificações do usuário logado" })
  @ApiResponse({ status: 200, description: "Notificações e total não lidas" })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("take") take?: string,
  ) {
    const parsed = take ? Number.parseInt(take, 10) : undefined;
    return this.notifications.findForUser(
      user,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Patch("read-all")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Marca todas as notificações como lidas" })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user);
  }

  @Patch(":id/read")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Marca uma notificação como lida" })
  markRead(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.markRead(user, id);
  }

  @Delete()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Limpa a central de notificações do usuário" })
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.clear(user);
  }
}

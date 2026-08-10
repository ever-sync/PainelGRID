import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { DispatchTrackingService } from "./dispatch-tracking.service";

@ApiTags("dispatches")
@ApiBearerAuth()
@Controller("dispatches")
@Roles(Role.GESTOR, Role.CLIENTE)
export class DispatchTrackingController {
  constructor(private readonly dispatches: DispatchTrackingService) {}

  @Get("emails")
  listEmails(
    @CurrentUser() user: AuthenticatedUser,
    @Query("client_id") clientId: string,
    @Query("event_id") eventId?: string,
    @Query("status") status?: string,
    @Query("origin") origin?: string,
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
  ) {
    return this.dispatches.listEmailHistory(user, clientId, {
      eventId,
      status,
      origin,
      dateFrom,
      dateTo,
    });
  }
}

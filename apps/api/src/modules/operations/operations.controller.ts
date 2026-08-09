import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { OperationsService } from "./operations.service";

@ApiTags("operations")
@ApiBearerAuth()
@Controller("operations")
@Roles(Role.GESTOR, Role.CLIENTE)
export class OperationsController {
  constructor(private readonly service: OperationsService) {}
  @Get("dashboard") dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.service.dashboard(user, query);
  }
  @Get("rubinho-thermometer") rubinhoThermometer(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.service.rubinhoThermometer(user, query);
  }
  @Get("conversations/:id/audit") audit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.audit(user, id);
  }
  @Patch("issues/:id/resolve") resolve(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resolve(id, user);
  }
  @Patch("issues/:id/reopen") reopen(
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.reopen(id);
  }
}

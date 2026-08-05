import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreateIntegrationCredentialDto } from "./dto/create-integration-credential.dto";
import { IntegrationCredentialsService } from "./integration-credentials.service";

@ApiTags("integration-credentials")
@ApiBearerAuth()
@Roles(Role.GESTOR)
@Controller("clients/:clientId/integration-credentials")
export class IntegrationCredentialsController {
  constructor(private readonly credentials: IntegrationCredentialsService) {}

  @Get()
  @ApiOperation({
    summary: "Lista credenciais de integracao sem expor os segredos",
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("clientId", new ParseUUIDPipe()) clientId: string,
  ) {
    return this.credentials.list(user.sub, clientId);
  }

  @Post()
  @ApiOperation({
    summary: "Cria credencial; o segredo e retornado somente nesta resposta",
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("clientId", new ParseUUIDPipe()) clientId: string,
    @Body() dto: CreateIntegrationCredentialDto,
  ) {
    return this.credentials.create(user.sub, clientId, dto);
  }

  @Post(":credentialId/rotate")
  @ApiOperation({ summary: "Revoga a credencial atual e cria uma substituta" })
  rotate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("clientId", new ParseUUIDPipe()) clientId: string,
    @Param("credentialId", new ParseUUIDPipe()) credentialId: string,
  ) {
    return this.credentials.rotate(user.sub, clientId, credentialId);
  }

  @Post(":credentialId/revoke")
  @ApiOperation({ summary: "Revoga uma credencial de integracao" })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("clientId", new ParseUUIDPipe()) clientId: string,
    @Param("credentialId", new ParseUUIDPipe()) credentialId: string,
  ) {
    return this.credentials.revoke(user.sub, clientId, credentialId);
  }
}

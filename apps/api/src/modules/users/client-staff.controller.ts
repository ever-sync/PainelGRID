import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { FindClientStaffQueryDto } from './dto/find-client-staff-query.dto';
import { UpdateApprovalStatusDto } from './dto/update-approval-status.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('client-staff')
export class ClientStaffController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Lista equipe de um cliente' })
  @ApiResponse({ status: 200, description: 'Equipe retornada com sucesso' })
  findByClient(@Query() query: FindClientStaffQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findStaffByClient(user, query.client_id);
  }

  /**
   * Aprova ou recusa um auto-cadastro.
   * Fica aqui e nao em UsersController porque aquele e @Roles(GESTOR) na classe —
   * o acesso do cliente levaria 403.
   */
  @Patch(':id/approval')
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: 'Aprova ou recusa o cadastro de um membro da equipe' })
  @ApiResponse({ status: 200, description: 'Status de aprovação atualizado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para este usuário' })
  setApproval(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateApprovalStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setApprovalStatus(user, id, dto.status);
  }

  @Post(':id/resend-setup-email')
  @Roles(Role.GESTOR, Role.CLIENTE)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Reenvia o e-mail de criação de senha' })
  @ApiResponse({ status: 201, description: 'Tentativa de reenvio concluída' })
  @ApiResponse({ status: 400, description: 'Cadastro ainda não aprovado' })
  resendSetupEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.resendSetupEmail(user, id);
  }
}

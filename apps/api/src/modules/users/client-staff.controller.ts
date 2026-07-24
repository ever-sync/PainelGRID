import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { FindClientStaffQueryDto } from './dto/find-client-staff-query.dto';
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
}

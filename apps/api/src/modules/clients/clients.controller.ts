import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: 'Lista clientes visíveis para o usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Clientes retornados com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findAllForUser(user);
  }

  @Get(':id')
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: 'Busca cliente por ID' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para este cliente' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findOneForUser(user, id);
  }

  @Post()
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Cria um novo cliente' })
  @ApiResponse({ status: 201, description: 'Cliente criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 403, description: 'Apenas gestor pode criar cliente' })
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(Role.GESTOR, Role.CLIENTE)
  @ApiOperation({ summary: 'Atualiza cliente existente' })
  @ApiResponse({ status: 200, description: 'Cliente atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.updateForUser(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.GESTOR)
  @ApiOperation({ summary: 'Remove cliente por ID' })
  @ApiResponse({ status: 200, description: 'Cliente removido com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.deleteForUser(user, id);
  }
}

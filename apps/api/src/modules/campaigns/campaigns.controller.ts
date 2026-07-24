import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/types';
import { AuthenticatedUser } from '../auth/auth.types';
import { CampaignsService } from './campaigns.service';
import { FindCampaignsQueryDto } from './dto/find-campaigns-query.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @Roles(Role.GESTOR, Role.CLIENTE, Role.VENDEDOR, Role.RECEPCAO)
  @ApiOperation({ summary: 'Lista campanhas filtradas pelo cliente do usuário' })
  @ApiResponse({ status: 200, description: 'Campanhas retornadas com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para listar campanhas' })
  findAll(@Query() query: FindCampaignsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.findAll(user, query);
  }
}

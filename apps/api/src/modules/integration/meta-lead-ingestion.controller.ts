import {
  Body,
  Controller,
  ParseArrayPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { FacebookLeadPayloadDto } from '../leads/dto/facebook-lead-payload.dto';
import { LeadsService } from '../leads/leads.service';
import { MetaLeadIngestionKeyGuard } from './meta-lead-ingestion-key.guard';

@ApiTags('integrations')
@Controller('integrations/v1/leads/facebook')
@Public()
@UseGuards(MetaLeadIngestionKeyGuard)
@Throttle({ default: { limit: 300, ttl: 60000 } })
@ApiHeader({ name: 'X-Leadflow-Meta-Ingestion-Key', required: true })
export class MetaLeadIngestionController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('auto')
  @ApiOperation({
    summary: 'Resolve o cliente pelo formulario Meta e importa os leads',
    description:
      'Endpoint global para o receptor de webhooks Meta. Nao aceita client_id: ' +
      'cada formulario_id e resolvido pelas selecoes salvas no painel do gestor. ' +
      'Formularios desconhecidos ou vinculados a mais de um cliente sao rejeitados.',
  })
  @ApiResponse({
    status: 201,
    description: 'Cliente resolvido e lote importado com deduplicacao.',
  })
  @ApiResponse({ status: 401, description: 'Chave de ingestao invalida.' })
  @ApiResponse({ status: 403, description: 'Formulario nao vinculado.' })
  @ApiResponse({
    status: 409,
    description: 'Formulario vinculado a mais de um cliente.',
  })
  create(
    @Body(
      new ParseArrayPipe({
        items: FacebookLeadPayloadDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    payload: FacebookLeadPayloadDto[],
  ) {
    return this.leadsService.createFacebookLeadsAutomatically(payload);
  }
}

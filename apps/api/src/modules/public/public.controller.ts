import { Body, Controller, Get, Ip, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PublicService } from './public.service';
import { SubmitRatingDto } from './dto/submit-rating.dto';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  /**
   * Dados mínimos para a página do convite (sem autenticação).
   * Não expõe telefone nem e-mail.
   */
  @Public()
  @Get('check-in/preview')
  @ApiOperation({ summary: 'Retorna preview público de check-in por voucher' })
  @ApiResponse({ status: 200, description: 'Preview retornado com sucesso' })
  @ApiResponse({ status: 404, description: 'Convite inválido' })
  previewCheckIn(@Query('v') v: string | undefined, @Ip() ip: string) {
    if (!v?.trim()) {
      throw new NotFoundException('Convite invalido');
    }
    return this.publicService.checkInPreview(v.trim(), ip || 'unknown');
  }

  /** Dados minimos para a pagina publica de avaliacao (sem autenticacao). */
  @Public()
  @Get('rating/:token')
  @ApiOperation({ summary: 'Retorna preview publico do link de avaliacao' })
  @ApiResponse({ status: 200, description: 'Preview retornado com sucesso' })
  @ApiResponse({ status: 404, description: 'Link de avaliacao invalido' })
  ratingTarget(@Param('token') token: string, @Ip() ip: string) {
    return this.publicService.ratingTarget(token, ip || 'unknown');
  }

  /** Envio publico de avaliacao de atendimento (sem autenticacao). */
  @Public()
  @Post('rating/:token')
  @ApiOperation({ summary: 'Envia uma avaliacao publica de atendimento' })
  @ApiResponse({ status: 201, description: 'Avaliacao enviada com sucesso' })
  @ApiResponse({ status: 404, description: 'Link de avaliacao invalido' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas' })
  submitRating(
    @Param('token') token: string,
    @Body() dto: SubmitRatingDto,
    @Ip() ip: string,
  ) {
    return this.publicService.submitRating(token, dto, ip || 'unknown');
  }
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CampaignsReportQueryDto {
  @ApiPropertyOptional({
    description: 'Inicio do periodo (YYYY-MM-DD). Ausente = tudo que foi sincronizado.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fim do periodo (YYYY-MM-DD), inclusivo.',
    example: '2026-07-31',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Objetivo da campanha na Meta (ex.: OUTCOME_LEADS). Ausente = todos os tipos.',
    example: 'OUTCOME_LEADS',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  objective?: string;
}

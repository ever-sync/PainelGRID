import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CampaignsReportQueryDto {
  @ApiPropertyOptional({
    description:
      "Inicio do periodo (YYYY-MM-DD). Ausente = tudo que foi sincronizado.",
    example: "2026-07-01",
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: "Fim do periodo (YYYY-MM-DD), inclusivo.",
    example: "2026-07-31",
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description:
      "Objetivo da campanha na Meta (ex.: OUTCOME_LEADS). Ausente = todos os tipos.",
    example: "OUTCOME_LEADS",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  objective?: string;

  @ApiPropertyOptional({
    description: "Status na Meta (ACTIVE, PAUSED...). Ausente = todos.",
    example: "ACTIVE",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @ApiPropertyOptional({
    description:
      "Restringe as campanhas vinculadas a este cliente. Evita trazer a conta " +
      "de anuncio inteira so para o front descartar.",
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  only_linked?: boolean;
}

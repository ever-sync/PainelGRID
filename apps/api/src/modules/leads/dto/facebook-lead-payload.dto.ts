import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/**
 * Formato entregue pela automacao que recebe leads do Facebook Lead Ads.
 * Os nomes em portugues sao mantidos de proposito para que o JSON possa ser
 * encaminhado para a API sem um node intermediario de remapeamento.
 */
export class FacebookLeadPayloadDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lead_id!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome!: string;

  @IsOptional()
  @Transform(trimString)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20)
  telefone?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  preferencia_atendimento?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  formulario_id!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  anuncio_id?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  anuncio?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  conjunto_id?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  conjunto?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  criativo_id?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  campanha_id?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  campanha?: string;

  @IsOptional()
  @IsDateString()
  criado_em?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  origem?: string;

  @IsOptional()
  @IsObject()
  todos_os_campos?: Record<string, unknown>;
}

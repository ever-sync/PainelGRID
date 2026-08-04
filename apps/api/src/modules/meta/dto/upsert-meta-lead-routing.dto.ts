import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const META_LEAD_WHATSAPP_TEMPLATE_PARAMETER_KEYS = [
  'lead_name',
  'event_name',
  'company_name',
  'event_date',
  'event_location',
] as const;

export type MetaLeadWhatsappTemplateParameterKey =
  (typeof META_LEAD_WHATSAPP_TEMPLATE_PARAMETER_KEYS)[number];

export class UpsertMetaLeadRoutingDto {
  @ApiProperty()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  form_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  event_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  crm_pipeline_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  call_stage_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  whatsapp_stage_id!: string;

  @ApiProperty({ required: false, example: 'boas_vindas_evento' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/)
  whatsapp_template_name?: string;

  @ApiProperty({ required: false, example: 'pt_BR' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20)
  @Matches(/^[a-z]{2}(?:_[A-Z]{2})?$/)
  whatsapp_template_language?: string;

  @ApiProperty({
    required: false,
    isArray: true,
    enum: META_LEAD_WHATSAPP_TEMPLATE_PARAMETER_KEYS,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(META_LEAD_WHATSAPP_TEMPLATE_PARAMETER_KEYS, { each: true })
  whatsapp_template_parameter_keys?: MetaLeadWhatsappTemplateParameterKey[];
}

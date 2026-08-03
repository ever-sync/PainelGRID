import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

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
}

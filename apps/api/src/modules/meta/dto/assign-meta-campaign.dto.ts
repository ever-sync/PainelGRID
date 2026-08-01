import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignMetaCampaignDto {
  @ApiProperty({ description: 'ID da campanha na Meta', example: '23851234567890123' })
  @IsString()
  @MaxLength(100)
  meta_campaign_id!: string;

  @ApiProperty({ description: 'Cliente dono da campanha' })
  @IsUUID()
  client_id!: string;

  @ApiPropertyOptional({
    description: 'Evento ao qual a campanha pertence. Ausente = fica so no cliente.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  event_id?: string | null;
}

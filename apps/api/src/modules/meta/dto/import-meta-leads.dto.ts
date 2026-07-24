import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class ImportMetaLeadsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  client_id!: string;

  @ApiPropertyOptional({ type: [String], description: 'IDs dos formularios selecionados' })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  form_ids?: string[];
}

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const CODE_PATTERN = /^[A-Z0-9_-]{4,40}$/;

export class BulkMoveLeadsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  lead_ids!: string[];

  @IsString()
  @Matches(CODE_PATTERN, {
    message: 'pipeline_code deve conter apenas A-Z, 0-9, _ ou - (4-40 chars)',
  })
  pipeline_code!: string;

  @IsString()
  @Matches(CODE_PATTERN, { message: 'stage_code deve conter apenas A-Z, 0-9, _ ou - (4-40 chars)' })
  stage_code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

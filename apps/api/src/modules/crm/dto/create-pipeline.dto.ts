import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const CODE_PATTERN = /^[A-Z0-9_-]{4,40}$/;

export class CreatePipelineStageInputDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(CODE_PATTERN, { message: 'code deve conter apenas A-Z, 0-9, _ ou - (4-40 chars)' })
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  display_order?: number;

  @IsOptional()
  @IsString()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  is_final_stage?: boolean;
}

export class CreatePipelineDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(CODE_PATTERN, { message: 'code deve conter apenas A-Z, 0-9, _ ou - (4-40 chars)' })
  code?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePipelineStageInputDto)
  stages?: CreatePipelineStageInputDto[];
}

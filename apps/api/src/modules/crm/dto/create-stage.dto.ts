import { Type } from "class-transformer";
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

const CODE_PATTERN = /^[A-Z0-9_-]{4,40}$/;

export class CreateStageDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(CODE_PATTERN, {
    message: "code deve conter apenas A-Z, 0-9, _ ou - (4-40 chars)",
  })
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

import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class SubmitRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  event_score?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  nps_score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customer_name?: string;
}

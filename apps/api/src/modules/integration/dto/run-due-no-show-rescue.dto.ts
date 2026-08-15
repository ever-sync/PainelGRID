import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class RunDueNoShowRescueDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  template_name?: string;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  lookback_hours?: number;
}

import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";

export class RunNoShowRescueDto {
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @IsUUID()
  event_id?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  target_date!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  template_name?: string;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}

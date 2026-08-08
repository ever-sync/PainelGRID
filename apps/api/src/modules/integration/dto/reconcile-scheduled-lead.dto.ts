import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class ReconcileScheduledLeadDto {
  @IsUUID()
  lead_id!: string;

  @IsDateString()
  scheduled_at!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(240)
  dispatch_key!: string;
}

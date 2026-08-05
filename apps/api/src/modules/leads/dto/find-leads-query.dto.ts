import { ConfirmationStatus, LeadSource } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class FindLeadsQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsEnum(ConfirmationStatus)
  confirmation_status?: ConfirmationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  event_id?: string;

  @IsOptional()
  @Type(() => Boolean)
  unassigned_only?: boolean;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  take?: number;

  /** Retorna apenas leads criados em ou após esta data/hora (ISO 8601). */
  @IsOptional()
  @IsDateString()
  created_after?: string;

  /** Retorna apenas leads atualizados em ou após esta data/hora (ISO 8601). */
  @IsOptional()
  @IsDateString()
  updated_after?: string;

  @IsOptional()
  @IsUUID()
  crm_stage_id?: string;

  @IsOptional()
  @IsString()
  crm_stage_code?: string;

  @IsOptional()
  @IsString()
  crm_stage_name?: string;
}

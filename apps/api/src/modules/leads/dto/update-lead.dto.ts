import { ConfirmationStatus, LeadSource } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  event_interest_id?: string | null;

  @IsOptional()
  @IsUUID()
  crm_pipeline_id?: string | null;

  @IsOptional()
  @IsUUID()
  crm_stage_id?: string | null;

  @IsOptional()
  @IsEnum(ConfirmationStatus)
  confirmation_status?: ConfirmationStatus;

  @IsOptional()
  @IsUUID()
  assigned_vendor_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  store_visit_datetime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicle_plate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicle_model?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicle_year?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  companions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  last_name?: string | null;

  @IsOptional()
  @IsDateString()
  birth_date?: string | null;
}

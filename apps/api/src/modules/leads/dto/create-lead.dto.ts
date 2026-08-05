import { ConfirmationStatus, LeadSource } from "@prisma/client";
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
} from "class-validator";

export class CreateLeadDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsEnum(LeadSource)
  source!: LeadSource;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  event_interest_id?: string;

  @IsOptional()
  @IsUUID()
  crm_pipeline_id?: string;

  @IsOptional()
  @IsUUID()
  crm_stage_id?: string;

  @IsOptional()
  @IsEnum(ConfirmationStatus)
  confirmation_status?: ConfirmationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicle_plate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicle_model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicle_year?: string;
}

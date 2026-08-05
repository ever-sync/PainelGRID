import { Type } from "class-transformer";
import { ConfirmationStatus } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

class CrmStageStatusRuleDto {
  @IsEnum(ConfirmationStatus)
  status!: ConfirmationStatus;

  @IsUUID()
  stage_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  stage_code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stage_name?: string | null;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  company_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_url?: string | null;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  webhook_url_n8n?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_street?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  address_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  address_complement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  address_district?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  address_city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  address_state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  address_zipcode?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contact_email?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrmStageStatusRuleDto)
  crm_stage_status_rules?: CrmStageStatusRuleDto[] | null;
}

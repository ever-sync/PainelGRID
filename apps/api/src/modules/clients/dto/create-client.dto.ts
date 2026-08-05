import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  company_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_url?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(500)
  webhook_url_n8n?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  address_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  address_complement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  address_district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  address_city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  address_state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  address_zipcode?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contact_email?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

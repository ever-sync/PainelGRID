import { SaleType } from "@prisma/client";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class CreateQuickSaleDto {
  @IsUUID()
  client_id!: string;

  @IsUUID()
  event_id!: string;

  @IsUUID()
  vendor_id!: string;

  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @ValidateIf((dto: CreateQuickSaleDto) => !dto.lead_id)
  @IsString()
  @MaxLength(255)
  lead_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lead_phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  lead_email?: string;

  @IsOptional()
  @IsUUID()
  vehicle_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  product?: string;

  @IsEnum(SaleType)
  type!: SaleType;

  @IsString()
  @MaxLength(40)
  value!: string;

  @IsDateString()
  sold_at!: string;

  @IsString()
  @MaxLength(100)
  order_number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wristband_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

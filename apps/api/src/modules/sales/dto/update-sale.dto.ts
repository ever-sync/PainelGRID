import { SaleType } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class UpdateSaleDto {
  @IsUUID()
  lead_id!: string;

  @IsUUID()
  vendor_id!: string;

  @IsEnum(SaleType)
  type!: SaleType;

  @IsString()
  @MaxLength(255)
  product!: string;

  @IsString()
  @MaxLength(40)
  value!: string;

  @IsDateString()
  sold_at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  order_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

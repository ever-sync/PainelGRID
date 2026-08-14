import { SaleType } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateSaleDto {
  @IsUUID()
  appointment_id!: string;

  @IsEnum(SaleType)
  type!: SaleType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  product?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  model?: string;

  @IsString()
  @MaxLength(40)
  value!: string;

  @IsOptional()
  @IsDateString()
  sold_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  order_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

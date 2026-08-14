import { IsEnum, IsOptional, IsUUID } from "class-validator";

export enum VendorCallMode {
  MANUAL = "manual",
  AUTOMATIC = "automatic",
}

export enum VendorQueueCategory {
  SEMINOVO = "seminovo",
  PCD = "pcd",
  NOVO = "novo",
  VD = "vd",
  ASSINATURA = "assinatura",
}

export class CallVendorDto {
  @IsOptional()
  @IsEnum(VendorCallMode)
  mode?: VendorCallMode;

  @IsOptional()
  @IsUUID()
  vendor_id?: string;

  @IsOptional()
  @IsEnum(VendorQueueCategory)
  category?: VendorQueueCategory;
}

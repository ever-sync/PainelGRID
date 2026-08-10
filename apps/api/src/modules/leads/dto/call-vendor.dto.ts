import { IsEnum, IsOptional, IsUUID } from "class-validator";

export enum VendorCallMode {
  MANUAL = "manual",
  AUTOMATIC = "automatic",
}

export class CallVendorDto {
  @IsOptional()
  @IsEnum(VendorCallMode)
  mode?: VendorCallMode;

  @IsOptional()
  @IsUUID()
  vendor_id?: string;
}

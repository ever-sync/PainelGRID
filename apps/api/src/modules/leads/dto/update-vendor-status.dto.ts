import { IsEnum } from "class-validator";

export enum SettableVendorStatus {
  ONLINE = "online",
  AWAY = "away",
}

export class UpdateVendorStatusDto {
  @IsEnum(SettableVendorStatus)
  status!: SettableVendorStatus;
}

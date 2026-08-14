import { IsUUID } from "class-validator";

export class SyncVehicleCatalogDto {
  @IsUUID()
  client_id!: string;
}

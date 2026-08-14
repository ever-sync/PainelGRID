import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class ImportVehicleCatalogDto {
  @IsUUID()
  client_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID("4", { each: true })
  catalog_ids!: string[];
}

import { IsOptional, IsUUID } from "class-validator";

export class ImportLeadsDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;
}

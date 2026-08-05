import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class DisconnectMetaDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  client_id!: string;
}

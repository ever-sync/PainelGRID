import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class TriggerMetaSyncDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  client_id!: string;
}

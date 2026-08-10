import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID, MaxLength } from "class-validator";

export class AuditLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  event_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(100)
  search?: string;
}

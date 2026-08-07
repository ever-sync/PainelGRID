import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

const DISPATCH_STATUSES = [
  "queued",
  "scheduled",
  "sent",
  "delivered",
  "read",
  "replied",
  "failed",
  "converted",
] as const;

export class UpsertDispatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @ApiProperty()
  @IsUUID()
  lead_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  event_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  message_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  appointment_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sale_id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(191)
  dispatch_key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  workflow_key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  dispatch_type!: string;

  @ApiProperty({ example: "whatsapp" })
  @IsString()
  @MaxLength(40)
  channel!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  provider_message_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  template_name?: string;

  @ApiPropertyOptional({ enum: DISPATCH_STATUSES })
  @IsOptional()
  @IsIn(DISPATCH_STATUSES)
  status?: (typeof DISPATCH_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurred_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  conversion_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  revenue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  failure_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  failure_reason?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

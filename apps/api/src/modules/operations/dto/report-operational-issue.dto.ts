import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class ReportOperationalIssueDto {
  @IsString() @MaxLength(80) type!: string;
  @IsOptional() @IsIn(["info", "warning", "critical"]) severity?: string;
  @IsString() @MaxLength(255) title!: string;
  @IsString() message!: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsString() @MaxLength(255) fingerprint!: string;
  @IsOptional() @IsUUID() client_id?: string;
  @IsOptional() @IsUUID() lead_id?: string;
  @IsOptional() @IsUUID() conversation_id?: string;
  @IsOptional() @IsUUID() event_id?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

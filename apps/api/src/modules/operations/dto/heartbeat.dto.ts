import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class HeartbeatDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsUUID() client_id?: string;
  @IsOptional() @IsIn(["healthy", "warning", "failed"]) status?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

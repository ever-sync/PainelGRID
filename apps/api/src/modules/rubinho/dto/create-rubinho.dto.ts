import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateRubinhoDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tone?: string;

  @IsOptional()
  @IsNumber()
  delay_minutes?: number;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  event_ids?: string[];
}

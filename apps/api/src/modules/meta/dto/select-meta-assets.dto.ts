import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from "class-validator";

export class SelectMetaAssetsDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  client_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o) => !o.gestor_token)
  @IsString()
  oauth_session_id?: string;

  @ApiPropertyOptional({
    description: "Aplicar seleção usando token Meta persistido do gestor.",
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  gestor_token?: boolean;

  @ApiProperty()
  @IsString()
  business_id!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ad_account_ids?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  page_ids?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  form_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  waba_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone_number_id?: string;
}

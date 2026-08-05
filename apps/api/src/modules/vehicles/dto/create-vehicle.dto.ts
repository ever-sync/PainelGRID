import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateVehicleDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MaxLength(100)
  brand!: string;

  @IsString()
  @MaxLength(150)
  model!: string;

  @IsString()
  @MaxLength(50)
  year_or_km!: string;

  @IsString()
  @MaxLength(100)
  price!: string;

  @IsString()
  stores!: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gallery?: string[];

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  manufacturing_year?: string;

  @IsOptional()
  @IsString()
  model_year?: string;

  @IsOptional()
  @IsString()
  km?: string;
}

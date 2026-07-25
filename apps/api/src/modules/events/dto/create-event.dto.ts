import { Type } from 'class-transformer';
import { EventStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EventDayDto {
  @IsString()
  start!: string;

  @IsOptional()
  @IsString()
  end?: string;
}

export class CreateEventDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  event_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  launch_date?: string;

  @IsDateString()
  event_date!: string;

  @IsOptional()
  @IsDateString()
  event_end_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sales_target?: number;

  @IsOptional()
  @IsBoolean()
  require_wristband?: boolean;

  /** Valor total investido no evento (R$). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_investment?: number;

  /** Parte do investimento destinada a tráfego pago (R$). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paid_traffic_investment?: number;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  cover_image_url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  image_urls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  participant_client_ids?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventDayDto)
  event_days?: EventDayDto[];
}

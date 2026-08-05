import { Type } from "class-transformer";
import { EventStatus } from "@prisma/client";
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
} from "class-validator";

export class EventDayDto {
  @IsString()
  start!: string;

  @IsOptional()
  @IsString()
  end?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  event_type?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  launch_date?: string | null;

  @IsOptional()
  @IsDateString()
  event_date?: string;

  @IsOptional()
  @IsDateString()
  event_end_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  sales_target?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  scheduled_target?: number | null;

  @IsOptional()
  @IsBoolean()
  require_wristband?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_vendor_checkin?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_vendor_fipe?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_investment?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paid_traffic_investment?: number | null;

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

import {
  AppointmentActorType,
  AppointmentChannel,
  AppointmentSource,
} from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateAppointmentDto {
  @IsUUID()
  lead_id!: string;

  @IsUUID()
  event_id!: string;

  @IsOptional()
  @IsUUID()
  conversation_id?: string | null;

  @IsDateString()
  scheduled_at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsEnum(AppointmentChannel)
  channel?: AppointmentChannel;

  @IsOptional()
  @IsEnum(AppointmentSource)
  source?: AppointmentSource;

  @IsOptional()
  @IsEnum(AppointmentActorType)
  created_by_type?: AppointmentActorType;

  @IsOptional()
  @IsUUID()
  created_by_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

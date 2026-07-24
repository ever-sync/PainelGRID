import { AppointmentSource } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmAppointmentDto {
  @IsOptional()
  @IsEnum(AppointmentSource)
  source?: AppointmentSource;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

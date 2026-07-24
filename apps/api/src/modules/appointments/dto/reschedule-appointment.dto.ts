import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class RescheduleAppointmentDto {
  @IsDateString()
  scheduled_at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

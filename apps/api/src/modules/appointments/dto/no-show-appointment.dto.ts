import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class NoShowAppointmentDto {
  @ApiPropertyOptional({ description: 'Motivo do no-show (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

import { EventStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class FindEventsQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}

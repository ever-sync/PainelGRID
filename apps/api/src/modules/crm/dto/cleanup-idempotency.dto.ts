import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CleanupIdempotencyDto {
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  older_than_hours?: number;
}

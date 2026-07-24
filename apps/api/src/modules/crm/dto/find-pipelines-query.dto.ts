import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase());
  }

  return undefined;
}

export class FindPipelinesQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  include_inactive?: boolean;
}

import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RequestConversationHandoffDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  trigger_type?: string;

  @IsOptional()
  @IsString()
  requested_by_type?: string;

  @IsOptional()
  @IsString()
  requested_by_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

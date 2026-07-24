import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateAgentActionLogDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsString()
  trigger_type!: string;

  @IsString()
  decision_type!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  input_summary?: string;

  @IsOptional()
  @IsString()
  output_summary?: string;

  @IsOptional()
  action_payload?: Record<string, unknown> | unknown[];

  @IsString()
  result_status!: string;

  @IsOptional()
  @IsString()
  error_message?: string;
}

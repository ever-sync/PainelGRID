import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class CreateAgentActionLogDto {
  @IsOptional()
  @IsUUID()
  message_id?: string;

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

  @IsOptional()
  previous_state?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  received_message?: string;

  @IsOptional()
  @IsString()
  next_stage?: string;

  @IsOptional()
  @IsString()
  tool_name?: string;

  @IsOptional()
  tool_input?: Record<string, unknown>;

  @IsOptional()
  api_response?: Record<string, unknown>;

  @IsOptional()
  resulting_state?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  block_reason?: string;
}

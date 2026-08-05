import {
  IsBoolean,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class UpdateConversationStateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  current_intent?: string | null;

  @IsOptional()
  @IsBoolean()
  awaiting_confirmation?: boolean;

  @IsOptional()
  @IsUUID()
  last_offered_event_id?: string | null;

  @IsOptional()
  @IsDateString()
  last_offered_slot?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_agent_action?: string | null;

  @IsOptional()
  @IsBoolean()
  handoff_required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  handoff_reason?: string | null;

  @IsOptional()
  @IsObject()
  state_payload?: Record<string, unknown>;
}

import { IsOptional, IsUUID } from "class-validator";

export class GetAgentEventsAvailabilityQueryDto {
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @IsUUID()
  lead_id?: string;
}

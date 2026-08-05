import { ValidateIf, IsUUID } from "class-validator";

export class GetAgentWhatsappContextQueryDto {
  @ValidateIf((o: GetAgentWhatsappContextQueryDto) => !o.lead_id)
  @IsUUID()
  conversation_id?: string;

  @ValidateIf((o: GetAgentWhatsappContextQueryDto) => !o.conversation_id)
  @IsUUID()
  lead_id?: string;
}

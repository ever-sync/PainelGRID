import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators";
import { ResolveWhatsappContextDto } from "../whatsapp-context/dto/resolve-whatsapp-context.dto";
import { WhatsappContextResolverService } from "../whatsapp-context/whatsapp-context-resolver.service";
import { MetaLeadIngestionKeyGuard } from "./meta-lead-ingestion-key.guard";

@ApiTags("integrations")
@Controller("integrations/v1/rubinho")
@Public()
@UseGuards(MetaLeadIngestionKeyGuard)
@ApiHeader({ name: "X-Leadflow-Meta-Ingestion-Key", required: true })
export class RubinhoContextController {
  constructor(private readonly resolver: WhatsappContextResolverService) {}

  @Post("resolve-context")
  @ApiOperation({
    summary: "Resolve o contexto persistido antes de executar o Rubinho",
    description:
      "Usa a mensagem/template que originou a resposta e nunca escolhe o cliente apenas pelo número compartilhado.",
  })
  resolve(@Body() dto: ResolveWhatsappContextDto) {
    return this.resolver.resolve({
      phoneNumberId: dto.phone_number_id,
      customerPhone: dto.customer_phone,
      providerMessageId: dto.provider_message_id,
    });
  }
}

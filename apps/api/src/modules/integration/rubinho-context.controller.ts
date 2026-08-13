import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators";
import { ResolveWhatsappContextDto } from "../whatsapp-context/dto/resolve-whatsapp-context.dto";
import { WhatsappContextResolverService } from "../whatsapp-context/whatsapp-context-resolver.service";
import { DispatchTrackingService } from "../dispatch-tracking/dispatch-tracking.service";
import { MetaLeadIngestionKeyGuard } from "./meta-lead-ingestion-key.guard";

@ApiTags("integrations")
@Controller("integrations/v1/rubinho")
@Public()
@UseGuards(MetaLeadIngestionKeyGuard)
@ApiHeader({ name: "X-Leadflow-Meta-Ingestion-Key", required: true })
export class RubinhoContextController {
  constructor(
    private readonly resolver: WhatsappContextResolverService,
    private readonly dispatchTracking: DispatchTrackingService,
  ) {}

  @Post("resolve-context")
  @ApiOperation({
    summary: "Resolve o contexto persistido antes de executar o Rubinho",
    description:
      "Usa a mensagem/template que originou a resposta e nunca escolhe o cliente apenas pelo número compartilhado.",
  })
  async resolve(@Body() dto: ResolveWhatsappContextDto) {
    const context = await this.resolver.resolve({
      phoneNumberId: dto.phone_number_id,
      customerPhone: dto.customer_phone,
      providerMessageId: dto.provider_message_id,
    });

    // Este endpoint e chamado pelo n8n ao receber uma mensagem real do lead.
    // Se a Meta informou context.id, confirmamos a resposta no disparo exato.
    if (context.authorized && dto.provider_message_id) {
      await this.dispatchTracking.markReplyByProviderMessageId(
        dto.provider_message_id,
        new Date(),
      );
    }

    return context;
  }
}

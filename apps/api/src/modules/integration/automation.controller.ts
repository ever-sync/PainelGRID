import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators";
import { AppointmentsService } from "../appointments/appointments.service";
import { LeadsService } from "../leads/leads.service";
import { AutomationKeyGuard } from "./automation-key.guard";
import { SendCredentialEmailDto } from "./dto/send-credential-email.dto";

@ApiTags("automations")
@Controller("integrations/v1/automations")
@Public()
@UseGuards(AutomationKeyGuard)
@Throttle({ default: { limit: 300, ttl: 60000 } })
@ApiHeader({ name: "X-N8N-Automation-Key", required: true })
export class AutomationController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly leads: LeadsService,
  ) {}

  @Post("credential-email")
  @ApiOperation({
    summary: "Envia a credencial do evento por e-mail de forma idempotente",
  })
  sendCredentialEmail(@Body() dto: SendCredentialEmailDto) {
    return this.appointments.sendEventCredentialEmailForAutomation(
      dto.lead_id,
      dto.dispatch_key,
    );
  }

  @Post("credential-delivery")
  @ApiOperation({
    summary:
      "Envia a credencial completa por WhatsApp e e-mail de forma idempotente",
  })
  sendCredentialDelivery(@Body() dto: SendCredentialEmailDto) {
    return this.appointments.deliverCredentialForLead(
      dto.lead_id,
      dto.dispatch_key,
    );
  }

  @Post("initial-template/status")
  @ApiOperation({
    summary: "Consulta a fila global de templates iniciais sem disparar",
  })
  initialTemplateStatus() {
    return this.leads.countInitialTemplateQueue();
  }

  @Post("initial-template/next")
  @ApiOperation({
    summary: "Dispara o próximo template inicial e move o lead para Em contato",
  })
  dispatchNextInitialTemplate() {
    return this.leads.dispatchNextInitialWhatsappTemplate();
  }
}

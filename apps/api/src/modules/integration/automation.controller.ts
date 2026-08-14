import {
  Body,
  Controller,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators";
import { AppointmentsService } from "../appointments/appointments.service";
import { LeadsService } from "../leads/leads.service";
import { DispatchTrackingService } from "../dispatch-tracking/dispatch-tracking.service";
import { AutomationKeyGuard } from "./automation-key.guard";
import { SendCredentialEmailDto } from "./dto/send-credential-email.dto";
import { ReconcileScheduledLeadDto } from "./dto/reconcile-scheduled-lead.dto";

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
    private readonly dispatchTracking: DispatchTrackingService,
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

  @Post("reconcile-scheduled-lead")
  @ApiOperation({
    summary:
      "Reconcilia um lead que escolheu uma data e envia a credencial por e-mail",
  })
  reconcileScheduledLead(@Body() dto: ReconcileScheduledLeadDto) {
    return this.appointments.reconcileScheduledLeadForAutomation(dto);
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

  @Post("initial-template/pilot")
  @ApiOperation({
    summary: "Dispara um lead específico após revalidar as proteções do piloto",
  })
  dispatchInitialTemplatePilot(
    @Body("lead_id", new ParseUUIDPipe()) leadId: string,
  ) {
    return this.leads.dispatchInitialWhatsappTemplatePilot(leadId);
  }

  @Post("whatsapp/statuses")
  @ApiOperation({
    summary: "Registra status sent/delivered/read/failed recebidos pelo n8n",
  })
  ingestWhatsappStatuses(@Body() payload: unknown) {
    return this.dispatchTracking.ingestWhatsappStatuses(payload);
  }

  @Post("email-attempt-2/status")
  @ApiOperation({
    summary: "Consulta a fila de recuperação por e-mail após 24h",
  })
  emailAttempt2Status() {
    return this.leads.countEmailAttempt2Queue();
  }

  @Post("email-attempt-2/next")
  @ApiOperation({ summary: "Envia um e-mail de recuperação e avança a etapa" })
  dispatchNextEmailAttempt2() {
    return this.leads.dispatchNextEmailAttempt2();
  }
}

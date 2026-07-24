import { Body, Controller, Headers, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { IntegrationKeyGuard } from '../integration/integration-key.guard';
import { AppointmentsService } from './appointments.service';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { ConfirmAppointmentDto } from './dto/confirm-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { NoShowAppointmentDto } from './dto/no-show-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

@ApiTags('agent-appointments')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Leadflow-Integration-Key', required: true })
@Controller('agent/appointments')
@Public()
@UseGuards(IntegrationKeyGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria agendamento via integração' })
  @ApiResponse({ status: 201, description: 'Agendamento criado com sucesso' })
  create(@Body() dto: CreateAppointmentDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.appointmentsService.create(dto, idempotencyKey);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirma agendamento via integração' })
  @ApiResponse({ status: 201, description: 'Agendamento confirmado com sucesso' })
  confirm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.confirm(id, dto, idempotencyKey);
  }

  @Post(':id/reschedule')
  @ApiOperation({ summary: 'Reagenda agendamento via integração' })
  @ApiResponse({ status: 201, description: 'Agendamento reagendado com sucesso' })
  reschedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.reschedule(id, dto, idempotencyKey);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela agendamento via integração' })
  @ApiResponse({ status: 201, description: 'Agendamento cancelado com sucesso' })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.cancel(id, dto, idempotencyKey);
  }

  @Post(':id/no-show')
  @ApiOperation({
    summary: 'Registra no-show via integração',
    description:
      'Marca o agendamento como no-show (lead confirmou mas não compareceu). ' +
      'Move o lead automaticamente para a etapa NO_SHOW no CRM e dispara o webhook `appointment.no_show`.',
  })
  @ApiResponse({ status: 201, description: 'No-show registrado com sucesso' })
  noShow(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: NoShowAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.noShow(id, dto, idempotencyKey);
  }
}

import { Body, Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, Roles } from "../../common/decorators";
import { Role } from "../../common/types";
import { AuthenticatedUser } from "../auth/auth.types";
import { AppointmentsService } from "./appointments.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";

@ApiTags("appointments")
@ApiBearerAuth()
@Controller("appointments")
export class PanelAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles(Role.VENDEDOR)
  @ApiOperation({ summary: "Cria agendamento pelo painel do vendedor" })
  @ApiResponse({ status: 201, description: "Agendamento criado com sucesso" })
  create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.createForVendor(user, dto);
  }

  @Post(":id/check-in")
  @Roles(Role.RECEPCAO)
  @ApiOperation({ summary: "Realiza check-in de agendamento pela recepção" })
  @ApiResponse({ status: 201, description: "Check-in realizado com sucesso" })
  checkIn(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.checkInByReception(user, id);
  }

  @Post(":id/reschedule")
  @Roles(Role.GESTOR)
  @ApiOperation({
    summary: "Reagenda uma visita pelas datas validas do evento",
  })
  @ApiResponse({
    status: 201,
    description: "Agendamento reagendado com sucesso",
  })
  reschedule(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.rescheduleForManager(user, id, dto);
  }
}

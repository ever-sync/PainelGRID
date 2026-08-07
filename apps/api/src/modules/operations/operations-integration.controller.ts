import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators";
import { IntegrationKeyGuard } from "../integration/integration-key.guard";
import { HeartbeatDto } from "./dto/heartbeat.dto";
import { ReportOperationalIssueDto } from "./dto/report-operational-issue.dto";
import { OperationsService } from "./operations.service";

@Controller("integrations/v1/operations")
@Public()
@UseGuards(IntegrationKeyGuard)
export class OperationsIntegrationController {
  constructor(private readonly service: OperationsService) {}
  @Post("issues") report(@Body() dto: ReportOperationalIssueDto) {
    return this.service.report(dto);
  }
  @Post("heartbeat") heartbeat(@Body() dto: HeartbeatDto) {
    return this.service.heartbeat(dto);
  }
}

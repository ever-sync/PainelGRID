import { IsUUID } from 'class-validator';

export class GetDashboardReportQueryDto {
  @IsUUID()
  client_id!: string;
}

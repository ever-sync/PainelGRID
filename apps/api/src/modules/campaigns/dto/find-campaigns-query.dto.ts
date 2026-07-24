import { IsUUID } from 'class-validator';

export class FindCampaignsQueryDto {
  @IsUUID()
  client_id!: string;
}

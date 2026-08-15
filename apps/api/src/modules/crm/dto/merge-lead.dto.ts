import { IsUUID } from "class-validator";

export class MergeLeadDto {
  @IsUUID() duplicate_lead_id!: string;
}

import { IsUUID } from "class-validator";

export class FindClientStaffQueryDto {
  @IsUUID()
  client_id!: string;
}

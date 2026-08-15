import { IsUUID } from "class-validator";

export class ChangeAttendanceVendorDto {
  @IsUUID()
  vendor_id!: string;
}

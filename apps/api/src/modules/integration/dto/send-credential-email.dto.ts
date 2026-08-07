import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SendCredentialEmailDto {
  @IsUUID()
  lead_id!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(240)
  dispatch_key!: string;
}

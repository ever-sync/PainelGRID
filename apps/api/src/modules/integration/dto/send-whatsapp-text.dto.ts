import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SendWhatsappTextDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(100)
  phone_number_id!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(20)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;
}

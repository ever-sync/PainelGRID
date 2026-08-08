import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ResolveWhatsappContextDto {
  @ApiProperty({
    description: "phone_number_id do numero compartilhado que recebeu a mensagem",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  phone_number_id!: string;

  @ApiProperty({ description: "Telefone/wa_id do lead que respondeu" })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  customer_phone!: string;

  @ApiPropertyOptional({
    description:
      "ID da mensagem de template respondida, quando o webhook trouxer context.id",
  })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  provider_message_id?: string;
}

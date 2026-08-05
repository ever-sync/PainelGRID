import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class CloseAttendanceDto {
  @ApiProperty({
    description: "Número da pulseira do atendimento",
    example: "1024",
    required: false,
  })
  @IsString()
  @IsOptional()
  wristband_number?: string;

  @ApiProperty({
    description: "CPF do cliente",
    example: "123.456.789-00",
    required: false,
  })
  @IsString()
  @IsOptional()
  cpf?: string;

  @ApiProperty({
    description: "Telefone do cliente",
    example: "11999999999",
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: "Indica se houve venda ao finalizar o atendimento",
  })
  @IsBoolean()
  sold!: boolean;

  @ApiProperty({
    description: "Duração do atendimento em segundos",
    required: false,
  })
  @IsNumber()
  @IsOptional()
  attendance_duration_seconds?: number;
}

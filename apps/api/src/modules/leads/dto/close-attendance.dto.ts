import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CloseAttendanceDto {
  @ApiProperty({ description: 'Número da pulseira do atendimento', example: '1024' })
  @IsString()
  @IsNotEmpty({ message: 'Número da pulseira é obrigatório' })
  wristband_number!: string;

  @ApiProperty({ description: 'CPF do cliente', example: '123.456.789-00' })
  @IsString()
  @IsNotEmpty({ message: 'CPF é obrigatório' })
  cpf!: string;

  @ApiProperty({ description: 'Telefone do cliente', example: '11999999999', required: false })
  @IsString()
  @IsOptional()
  phone?: string;
}

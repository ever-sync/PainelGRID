import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({ description: 'Token temporário do fluxo de 2FA' })
  @IsString()
  @IsUUID()
  temp_token!: string;

  @ApiProperty({ description: 'Código de 6 dígitos enviado por e-mail' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

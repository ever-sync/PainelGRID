import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password!: string;

  /** Default true (comportamento atual): sessao sobrevive ao fechar navegador/app. */
  @IsOptional()
  @IsBoolean()
  remember_me?: boolean;
}

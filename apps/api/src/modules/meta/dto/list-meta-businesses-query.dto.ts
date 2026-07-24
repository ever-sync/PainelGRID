import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class ListMetaBusinessesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  client_id!: string;

  /** Obrigatório salvo quando `gestor_token=true` (token Meta salvo no usuário gestor). */
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o) => !o.gestor_token)
  @IsString()
  oauth_session_id?: string;

  @ApiPropertyOptional({
    description: 'Usar token Meta do gestor autenticado (OAuth no dashboard).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  gestor_token?: boolean;
}

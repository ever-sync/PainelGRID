import { IsOptional, IsString, MinLength } from 'class-validator';

/** Corpo opcional: o refresh prioritario vem do cookie httpOnly (`painelgrid_refresh`). */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  refreshToken?: string;
}

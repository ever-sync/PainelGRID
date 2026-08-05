import { IsString, MinLength } from "class-validator";

export class MobileRefreshTokenDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

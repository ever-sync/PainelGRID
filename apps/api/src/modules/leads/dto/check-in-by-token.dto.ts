import { IsString, MaxLength, MinLength } from 'class-validator';

export class CheckInByTokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  token!: string;
}

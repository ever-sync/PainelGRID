import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, Validate } from 'class-validator';
import {
  IsStrongPasswordConstraint,
  STRONG_PASSWORD_USER_MESSAGE,
} from '../../../common/validators/is-strong-password.validator';

export class ChangePasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 255 })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  current_password!: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 255,
    description: STRONG_PASSWORD_USER_MESSAGE,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  @Validate(IsStrongPasswordConstraint)
  new_password!: string;
}

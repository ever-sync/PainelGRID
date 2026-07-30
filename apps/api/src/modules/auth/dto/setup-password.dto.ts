import { IsString, MaxLength, MinLength, Validate } from 'class-validator';
import { IsStrongPasswordConstraint } from '../../../common/validators/is-strong-password.validator';

/** Primeira senha do vendedor aprovado. Espelha ResetPasswordDto. */
export class SetupPasswordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  setup_token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(255)
  @Validate(IsStrongPasswordConstraint)
  new_password!: string;
}

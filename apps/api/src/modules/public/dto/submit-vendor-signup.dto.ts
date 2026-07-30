import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VendorCategory } from '../../../common/types';

/**
 * Auto-cadastro publico de vendedor. Espelha o formulario da aba Equipe,
 * menos `password` (criada depois, pelo link do e-mail de aprovacao),
 * `role` (sempre vendedor) e `client_id` (vem do token da URL).
 */
export class SubmitVendorSignupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @IsEnum(VendorCategory, { each: true })
  vendor_categories!: VendorCategory[];
}

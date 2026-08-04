import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { Role, VendorCategory } from '../../../common/types';
import { IsStrongPasswordConstraint } from '../../../common/validators/is-strong-password.validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  @Validate(IsStrongPasswordConstraint)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @IsEnum(VendorCategory)
  vendor_category?: VendorCategory;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(VendorCategory, { each: true })
  vendor_categories?: VendorCategory[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}

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
  ValidateIf,
} from "class-validator";
import { Role, VendorCategory } from "../../../common/types";
import { IsStrongPasswordConstraint } from "../../../common/validators/is-strong-password.validator";

export class CreateUserDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(255)
  @Validate(IsStrongPasswordConstraint)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsEnum(VendorCategory)
  vendor_category?: VendorCategory;

  @ValidateIf((o) => o.role === Role.VENDEDOR)
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(VendorCategory, { each: true })
  vendor_categories?: VendorCategory[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ValidateIf(
    (o) =>
      o.role === Role.CLIENTE ||
      o.role === Role.VENDEDOR ||
      o.role === Role.RECEPCAO,
  )
  @IsUUID()
  client_id?: string;
}

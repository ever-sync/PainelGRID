import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdateSalesTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  /** Aceita URL pública (http/https) OU data URL de imagem (data:image/...;base64,...). */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(2_000_000) // ~1.5MB binário em base64
  @Matches(
    /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,)/i,
    {
      message: "logo_url precisa ser http(s) ou data URL de imagem",
    },
  )
  logo_url?: string | null;
}

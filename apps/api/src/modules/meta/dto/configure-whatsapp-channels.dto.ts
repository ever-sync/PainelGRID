import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";

class WhatsappChannelDto {
  @ApiProperty()
  @IsString()
  waba_id!: string;

  @ApiProperty()
  @IsString()
  phone_number_id!: string;
}

export class ConfigureWhatsappChannelsDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  client_id!: string;

  @ApiProperty()
  @IsString()
  business_id!: string;

  @ApiProperty({ type: [WhatsappChannelDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsappChannelDto)
  channels!: WhatsappChannelDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primary_phone_number_id?: string;
}

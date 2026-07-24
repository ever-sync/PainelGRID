import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  @IsUUID()
  sender_id?: string | null;
}

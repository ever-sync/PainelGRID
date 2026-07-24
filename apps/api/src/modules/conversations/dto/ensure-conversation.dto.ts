import { ConversationChannel } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class EnsureConversationDto {
  @IsUUID()
  client_id!: string;

  @IsUUID()
  lead_id!: string;

  @IsEnum(ConversationChannel)
  channel: ConversationChannel = ConversationChannel.whatsapp;
}

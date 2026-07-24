import { IsUUID } from 'class-validator';

export class FindConversationsQueryDto {
  @IsUUID()
  client_id!: string;
}

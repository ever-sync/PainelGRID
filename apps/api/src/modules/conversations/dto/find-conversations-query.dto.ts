import { IsOptional, IsUUID } from 'class-validator';

export class FindConversationsQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;
}

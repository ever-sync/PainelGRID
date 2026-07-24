import { IsUUID } from 'class-validator';

export class AddTeamMemberDto {
  @IsUUID()
  user_id!: string;
}

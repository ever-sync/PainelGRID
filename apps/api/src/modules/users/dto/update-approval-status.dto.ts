import { IsIn } from 'class-validator';

/**
 * `@IsIn` em vez de `@IsEnum(UserApprovalStatus)` de proposito:
 * `pending` e estado de entrada do auto-cadastro e nao pode ser reposto pela API.
 */
export class UpdateApprovalStatusDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';
}

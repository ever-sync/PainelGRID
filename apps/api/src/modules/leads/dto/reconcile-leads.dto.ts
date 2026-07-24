import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Reconcilia os leads de um cliente com a fonte externa (ex.: Bitrix):
 * leads ativos cujo telefone NÃO está em `keep_phones` são arquivados
 * (soft-delete). Leads de origem `manual` nunca são removidos.
 */
export class ReconcileLeadsDto {
  @IsUUID()
  client_id!: string;

  @IsArray()
  @ArrayMaxSize(20000)
  @IsString({ each: true })
  keep_phones!: string[];

  /** Se true, apenas relata quantos seriam removidos, sem apagar. */
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}

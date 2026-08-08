import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

/** Teto por pagina: segura a resposta mesmo se o cliente pedir mais. */
export const CONVERSATIONS_MAX_TAKE = 200;
export const CONVERSATIONS_DEFAULT_TAKE = 100;

export class FindConversationsQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  /**
   * Busca por nome ou telefone do lead. Vive no servidor porque o painel
   * deixou de carregar todas as conversas de uma vez — filtrar so o que ja
   * foi baixado faria a busca ignorar o resto da base.
   */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONVERSATIONS_MAX_TAKE)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

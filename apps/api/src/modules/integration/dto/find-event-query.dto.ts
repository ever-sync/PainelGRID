import { IsOptional, IsUUID } from "class-validator";

/** Filtros aceitos ao buscar um evento via integração externa. */
export class IntegrationFindEventQueryDto {
  /** Quando informado, valida que o evento pertence a este cliente. */
  @IsOptional()
  @IsUUID()
  client_id?: string;
}

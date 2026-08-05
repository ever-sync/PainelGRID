import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

const SUFFIX_PATTERN = /^[A-Z0-9_-]{3,40}$/;

/** DTO simplificado para a IA mover lead – aceita apenas o sufixo da etapa. */
export class MoveLeadBySuffixDto {
  @IsString()
  @Matches(SUFFIX_PATTERN, {
    message:
      "stage_suffix deve conter apenas A-Z, 0-9, _ ou - (3-40 chars). " +
      "Valores: LIGACAO, EM_CONTATO, PRE_AGENDAMENTO, PRESENCA_AGENDADA, AGENDADOS_CONFIRMADOS, " +
      "PRESENCA_CANCELADA, PRESENCA_REAGENDADA, DESINTERESSE, LEMBRETE, " +
      "RECUPERACAO_VENDA, RECUPERACAO_PRESENCA, RECUPERACAO_RESPONDIDA, COMPRARAM, " +
      "ATENDIMENTO_ENCERRADO, FEEDBACK, RESPONDEU_FEEDBACK",
  })
  stage_suffix!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}

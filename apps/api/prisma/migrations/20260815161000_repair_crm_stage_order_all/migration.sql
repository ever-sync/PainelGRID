-- Reparo final: desloca todas as etapas, inclusive customizadas, antes de
-- reaplicar a ordem padrão. Assim nenhuma etapa fora do padrão colide.
UPDATE crm_stages
SET display_order = display_order + 100000;

UPDATE crm_stages
SET
  display_order = CASE
    WHEN code ~ '_NOVO_LEAD$' THEN 1
    WHEN code ~ '_TENTATIVA_CONTATO$' THEN 2
    WHEN code ~ '_TENTATIVA_2_EMAIL$' THEN 3
    WHEN code ~ '_LIGACAO$' THEN 4
    WHEN code ~ '_EM_CONTATO$' THEN 5
    WHEN code ~ '_PRE_AGENDADO$' THEN 6
    WHEN code ~ '_PRESENCA_AGENDADA$' THEN 7
    WHEN code ~ '_ENVIAR_CONFIRMACAO$' THEN 8
    WHEN code ~ '_AGENDADOS_CONFIRMADOS$' THEN 9
    WHEN code ~ '_PRESENCA_REAGENDADA$' THEN 10
    WHEN code ~ '_PRESENCA_CANCELADA$' THEN 11
    WHEN code ~ '_LEMBRETE$' THEN 12
    WHEN code ~ '_RECUPERACAO_VENDA$' THEN 13
    WHEN code ~ '_RECUPERACAO_PRESENCA$' THEN 14
    WHEN code ~ '_RECUPERACAO_RESPONDIDA$' THEN 15
    WHEN code ~ '_DESINTERESSE$' THEN 16
    WHEN code ~ '_AGUARDANDO$' THEN 17
    WHEN code ~ '_PRESENCA_CONFIRMADA$' THEN 18
    WHEN code ~ '_COMPRARAM$' THEN 19
    WHEN code ~ '_LEAD_PERDIDO$' THEN 20
    WHEN code ~ '_LEAD_AUSENTE$' THEN 21
    WHEN code ~ '_ATENDIMENTO_ENCERRADO$' THEN 22
    WHEN code ~ '_FEEDBACK$' THEN 23
    WHEN code ~ '_RESPONDEU_FEEDBACK$' THEN 24
    ELSE display_order
  END,
  name = CASE
    WHEN code ~ '_PRE_AGENDADO$' THEN 'Pré-agendado'
    WHEN code ~ '_PRESENCA_AGENDADA$' THEN 'Agendado'
    ELSE name
  END;

-- Cria a etapa operacional para agendamentos ainda sem check-in e deixa-a
-- imediatamente antes de PRESENCA_AGENDADA em todos os funis dos clientes.
DO $$
DECLARE
  current_stage RECORD;
  new_code TEXT;
  new_stage_id UUID;
BEGIN
  FOR current_stage IN
    SELECT id, pipeline_id, client_id, code, display_order, color
    FROM crm_stages
    WHERE right(code, length('_PRESENCA_AGENDADA')) = '_PRESENCA_AGENDADA'
  LOOP
    new_code := regexp_replace(current_stage.code, '_PRESENCA_AGENDADA$', '_PRE_AGENDADO');

    -- Coloca as etapas em uma faixa temporaria para permitir a reorganizacao
    -- sem colisao no indice unico (pipeline_id, display_order).
    UPDATE crm_stages
    SET display_order = display_order + 100000
    WHERE pipeline_id = current_stage.pipeline_id;

    IF NOT EXISTS (SELECT 1 FROM crm_stages WHERE code = new_code) THEN
      new_stage_id := gen_random_uuid();
      INSERT INTO crm_stages (
        id, client_id, pipeline_id, code, name, display_order, color,
        is_final_stage, created_at, updated_at
      ) VALUES (
        new_stage_id, current_stage.client_id, current_stage.pipeline_id,
        new_code, 'Pré-agendado', 100006,
        COALESCE(current_stage.color, '#6366F1'), false, NOW(), NOW()
      );
    END IF;

    -- Ordem operacional: Pré-agendado vem antes de Agendado.
    UPDATE crm_stages
    SET display_order = CASE
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
    END
    WHERE pipeline_id = current_stage.pipeline_id;
  END LOOP;
END $$;

-- Leads com agendamento ativo, mas sem check-in, ficam pendentes no
-- Pré-agendado. Leads já concluídos/check-in não são tocados.
UPDATE leads AS l
SET
  crm_stage_id = s.id,
  crm_pipeline_id = s.pipeline_id,
  confirmation_status = 'pending'::"ConfirmationStatus",
  updated_at = NOW()
FROM appointments AS a
JOIN crm_stages AS s
  ON right(s.code, length('_PRE_AGENDADO')) = '_PRE_AGENDADO'
WHERE a.lead_id = l.id
  AND s.client_id = l.client_id
  AND a.status IN ('proposed'::"AppointmentStatus", 'scheduled'::"AppointmentStatus", 'confirmed'::"AppointmentStatus")
  AND l.deleted_at IS NULL
  AND l.confirmation_status <> 'checked_in'::"ConfirmationStatus"
  AND l.assigned_vendor_id IS NOT NULL;

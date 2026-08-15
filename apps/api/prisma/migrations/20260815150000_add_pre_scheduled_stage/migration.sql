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

    IF EXISTS (SELECT 1 FROM crm_stages WHERE code = new_code) THEN
      CONTINUE;
    END IF;

    -- Evita colisao no indice unico (pipeline_id, display_order).
    UPDATE crm_stages
    SET display_order = display_order + 1000
    WHERE pipeline_id = current_stage.pipeline_id;

    new_stage_id := gen_random_uuid();
    INSERT INTO crm_stages (
      id, client_id, pipeline_id, code, name, display_order, color, is_final_stage,
      created_at, updated_at
    ) VALUES (
      new_stage_id,
      current_stage.client_id,
      current_stage.pipeline_id,
      new_code,
      'Pré-agendado',
      current_stage.display_order,
      COALESCE(current_stage.color, '#6366F1'),
      false,
      NOW(),
      NOW()
    );

    UPDATE crm_stages
    SET display_order = display_order + 10000
    WHERE pipeline_id = current_stage.pipeline_id
      AND id <> new_stage_id;

    UPDATE crm_stages
    SET display_order = display_order - 999 - 10000
    WHERE pipeline_id = current_stage.pipeline_id
      AND id <> new_stage_id;
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

import {
  clientIdToPipelineCode,
  clientIdToStageCode,
  DEFAULT_CRM_STAGES,
  getDefaultStageInputs,
} from './default-crm-pipeline';

describe('default-crm-pipeline', () => {
  const clientId = '9a42a285-e1c7-4263-8195-e23ad97bb586';

  it('gera pipeline_code compativel com integracao n8n', () => {
    expect(clientIdToPipelineCode(clientId)).toBe('PL_9A42A285E1C74263');
  });

  it('gera stage_code compativel com integracao n8n', () => {
    expect(clientIdToStageCode(clientId, 'NOVO_LEAD')).toBe('9A42A285E1C74263_NOVO_LEAD');
    expect(clientIdToStageCode(clientId, 'PRESENCA_AGENDADA')).toBe(
      '9A42A285E1C74263_PRESENCA_AGENDADA',
    );
  });

  it('define exatamente 22 etapas padrao', () => {
    expect(DEFAULT_CRM_STAGES).toHaveLength(22);
    expect(getDefaultStageInputs(clientId)).toHaveLength(22);
  });

  it('mantem display_order unico de 1 a 22', () => {
    const orders = DEFAULT_CRM_STAGES.map((s) => s.order);
    expect(new Set(orders).size).toBe(22);
    expect(Math.min(...orders)).toBe(1);
    expect(Math.max(...orders)).toBe(22);
  });
});

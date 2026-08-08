import { PrismaClient } from "@prisma/client";
import type { CreatePipelineStageInputDto } from "./dto/create-pipeline.dto";

export type DefaultCrmStageDef = {
  suffix: string;
  name: string;
  order: number;
  color: string;
  is_final_stage: boolean;
};

/** Funil padrão alinhado às automações e à operação comercial. */
export const DEFAULT_CRM_PIPELINE_NAME = "Funil de Vendas";
export const DEFAULT_CRM_PIPELINE_DESCRIPTION =
  "Pipeline padrão com 23 etapas (CRM / automações)";

export const DEFAULT_CRM_STAGES: readonly DefaultCrmStageDef[] = [
  {
    suffix: "NOVO_LEAD",
    name: "Novo Lead",
    order: 1,
    color: "#FF0636",
    is_final_stage: false,
  },
  {
    suffix: "TENTATIVA_CONTATO",
    name: "Tentativa contato",
    order: 2,
    color: "#F59E0B",
    is_final_stage: false,
  },
  {
    suffix: "TENTATIVA_2_EMAIL",
    name: "Tentativa 2 - Email",
    order: 3,
    color: "#0EA5E9",
    is_final_stage: false,
  },
  {
    suffix: "LIGACAO",
    name: "Ligação",
    order: 4,
    color: "#EC4899",
    is_final_stage: false,
  },
  {
    suffix: "EM_CONTATO",
    name: "Em Contato",
    order: 5,
    color: "#3D56A2",
    is_final_stage: false,
  },
  {
    suffix: "PRESENCA_AGENDADA",
    name: "Presença agendada",
    order: 6,
    color: "#FBBB49",
    is_final_stage: false,
  },
  {
    suffix: "ENVIAR_CONFIRMACAO",
    name: "Enviar confirmação",
    order: 7,
    color: "#22D3EE",
    is_final_stage: false,
  },
  {
    suffix: "AGENDADOS_CONFIRMADOS",
    name: "Agend. confirmados",
    order: 8,
    color: "#10B981",
    is_final_stage: false,
  },
  {
    suffix: "PRESENCA_REAGENDADA",
    name: "Presença reagendada",
    order: 9,
    color: "#FB923C",
    is_final_stage: false,
  },
  {
    suffix: "PRESENCA_CANCELADA",
    name: "Presença cancelada",
    order: 10,
    color: "#EF4444",
    is_final_stage: false,
  },
  {
    suffix: "LEMBRETE",
    name: "Lembrete",
    order: 11,
    color: "#06B6D4",
    is_final_stage: false,
  },
  {
    suffix: "RECUPERACAO_VENDA",
    name: "Recuperação de venda",
    order: 12,
    color: "#D97706",
    is_final_stage: false,
  },
  {
    suffix: "RECUPERACAO_PRESENCA",
    name: "Recuperação de presença",
    order: 13,
    color: "#4F46E5",
    is_final_stage: false,
  },
  {
    suffix: "RECUPERACAO_RESPONDIDA",
    name: "Recuperação respondida",
    order: 14,
    color: "#059669",
    is_final_stage: false,
  },
  {
    suffix: "DESINTERESSE",
    name: "Desinteresse",
    order: 15,
    color: "#78716C",
    is_final_stage: true,
  },
  {
    suffix: "AGUARDANDO",
    name: "Aguardando",
    order: 16,
    color: "#A78BFA",
    is_final_stage: false,
  },
  {
    suffix: "PRESENCA_CONFIRMADA",
    name: "Presença confirmada",
    order: 17,
    color: "#059669",
    is_final_stage: true,
  },
  {
    suffix: "COMPRARAM",
    name: "Compraram",
    order: 18,
    color: "#10B981",
    is_final_stage: true,
  },
  {
    suffix: "LEAD_PERDIDO",
    name: "Lead perdido",
    order: 19,
    color: "#DC2626",
    is_final_stage: true,
  },
  {
    suffix: "LEAD_AUSENTE",
    name: "Lead ausente",
    order: 20,
    color: "#991B1B",
    is_final_stage: true,
  },
  {
    suffix: "ATENDIMENTO_ENCERRADO",
    name: "Atendimento encerrado",
    order: 21,
    color: "#6B7280",
    is_final_stage: true,
  },
  {
    suffix: "FEEDBACK",
    name: "Feedback",
    order: 22,
    color: "#8B5CF6",
    is_final_stage: false,
  },
  {
    suffix: "RESPONDEU_FEEDBACK",
    name: "Respondeu feedback",
    order: 23,
    color: "#EC4899",
    is_final_stage: true,
  },
] as const;

/** Mapeia sufixos do funil antigo (7 etapas) para o funil padrão de 18. */
const LEGACY_STAGE_SUFFIX_MAP: Record<string, string> = {
  NOVO: "NOVO_LEAD",
  CONTACTADO: "EM_CONTATO",
  NAO_RESP: "LEAD_PERDIDO",
  AGENDADO: "PRESENCA_AGENDADA",
  CHECKIN: "PRESENCA_CONFIRMADA",
  CONVERTIDO: "PRESENCA_CONFIRMADA",
  PERDIDO: "LEAD_PERDIDO",
  // Removidas: colunas "Pré-agendamento" e "Conf. Pré-agendamento" — leads voltam para Novo Lead.
  PRE_AGENDAMENTO: "NOVO_LEAD",
  CONF_PRE_AGENDAMENTO: "NOVO_LEAD",
};

type PrismaLike = Pick<PrismaClient, "crmPipeline" | "crmStage" | "lead">;

export function clientIdToIdBase(clientId: string): string {
  return clientId.replace(/-/g, "").toUpperCase().slice(0, 16);
}

export function clientIdToPipelineCode(clientId: string): string {
  return `PL_${clientIdToIdBase(clientId)}`;
}

export function clientIdToStageCode(clientId: string, suffix: string): string {
  return `${clientIdToIdBase(clientId)}_${suffix}`;
}

export function getDefaultStageInputs(
  clientId: string,
): CreatePipelineStageInputDto[] {
  const idBase = clientIdToIdBase(clientId);
  return DEFAULT_CRM_STAGES.map((def) => ({
    code: `${idBase}_${def.suffix}`,
    name: def.name,
    display_order: def.order,
    color: def.color,
    is_final_stage: def.is_final_stage,
  }));
}

function stageSuffixFromCode(stageCode: string, idBase: string): string | null {
  const prefix = `${idBase}_`;
  if (!stageCode.startsWith(prefix)) {
    return null;
  }
  return stageCode.slice(prefix.length);
}

/**
 * Garante pipeline padrão (PL_{idBase}) e todas as etapas para o cliente.
 * Migra leads de etapas legadas (7 etapas) quando possível e remove etapas órfãs.
 */
export async function provisionDefaultCrmPipeline(
  prisma: PrismaLike,
  clientId: string,
): Promise<{ pipeline_id: string }> {
  const idBase = clientIdToIdBase(clientId);
  const pipelineCode = clientIdToPipelineCode(clientId);
  const defaultSuffixes = new Set(DEFAULT_CRM_STAGES.map((s) => s.suffix));

  const pipeline = await prisma.crmPipeline.upsert({
    where: { code: pipelineCode },
    update: {
      is_active: true,
      name: DEFAULT_CRM_PIPELINE_NAME,
      description: DEFAULT_CRM_PIPELINE_DESCRIPTION,
    },
    create: {
      client_id: clientId,
      code: pipelineCode,
      name: DEFAULT_CRM_PIPELINE_NAME,
      description: DEFAULT_CRM_PIPELINE_DESCRIPTION,
      is_active: true,
    },
  });

  // Temporarily offset display orders to avoid @@unique([pipeline_id, display_order]) conflicts during upsert
  const stagesToMove = await prisma.crmStage.findMany({
    where: { pipeline_id: pipeline.id },
    select: { id: true },
  });
  for (let i = 0; i < stagesToMove.length; i++) {
    await prisma.crmStage.update({
      where: { id: stagesToMove[i].id },
      data: { display_order: 10000 + i },
    });
  }

  const stageBySuffix = new Map<string, { id: string }>();

  for (const def of DEFAULT_CRM_STAGES) {
    const code = clientIdToStageCode(clientId, def.suffix);
    const stage = await prisma.crmStage.upsert({
      where: { code },
      update: {
        name: def.name,
        display_order: def.order,
        color: def.color,
        is_final_stage: def.is_final_stage,
        pipeline_id: pipeline.id,
      },
      create: {
        client_id: clientId,
        pipeline_id: pipeline.id,
        code,
        name: def.name,
        display_order: def.order,
        color: def.color,
        is_final_stage: def.is_final_stage,
      },
      select: { id: true },
    });
    stageBySuffix.set(def.suffix, stage);
  }

  const existingStages = await prisma.crmStage.findMany({
    where: { pipeline_id: pipeline.id },
    select: { id: true, code: true, display_order: true },
  });

  for (const oldStage of existingStages) {
    const suffix = stageSuffixFromCode(oldStage.code, idBase);
    if (!suffix || defaultSuffixes.has(suffix)) {
      continue;
    }

    const targetSuffix = LEGACY_STAGE_SUFFIX_MAP[suffix];
    const targetStage = targetSuffix
      ? stageBySuffix.get(targetSuffix)
      : undefined;

    if (targetStage) {
      await prisma.lead.updateMany({
        where: { crm_stage_id: oldStage.id },
        data: {
          crm_stage_id: targetStage.id,
          crm_pipeline_id: pipeline.id,
        },
      });
    }

    const remainingLeads = await prisma.lead.count({
      where: { crm_stage_id: oldStage.id, deleted_at: null },
    });

    if (remainingLeads === 0) {
      try {
        await prisma.crmStage.delete({ where: { id: oldStage.id } });
        continue;
      } catch {
        // Se houver referências históricas (ex: crm_history), mantemos a etapa mas mudamos a ordem para ocultar
      }
    }

    await prisma.crmStage.update({
      where: { id: oldStage.id },
      data: { display_order: 900 + oldStage.display_order },
    });
  }

  await prisma.lead.updateMany({
    where: {
      client_id: clientId,
      crm_pipeline_id: null,
      crm_stage_id: { not: null },
    },
    data: { crm_pipeline_id: pipeline.id },
  });

  await prisma.crmPipeline.updateMany({
    where: { client_id: clientId, id: { not: pipeline.id } },
    data: { is_active: false },
  });

  return { pipeline_id: pipeline.id };
}

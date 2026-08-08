import { PrismaClient } from "@prisma/client";
import { clientIdToStageCode } from "../modules/crm/default-crm-pipeline";

const prisma = new PrismaClient();
const shouldApply = process.argv.includes("--apply");

async function main() {
  const pipelines = await prisma.crmPipeline.findMany({
    where: {
      is_active: true,
      code: { startsWith: "PL_" },
    },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      client_id: true,
      code: true,
      client: { select: { company_name: true } },
      stages: {
        orderBy: { display_order: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          display_order: true,
        },
      },
    },
  });

  let created = 0;
  let alreadyExists = 0;
  let missingFirstAttempt = 0;

  for (const pipeline of pipelines) {
    const stageCode = clientIdToStageCode(
      pipeline.client_id,
      "TENTATIVA_2_EMAIL",
    );
    const existing = pipeline.stages.find((stage) => stage.code === stageCode);

    if (existing) {
      alreadyExists += 1;
      console.log(
        `[existente] ${pipeline.client.company_name}: ordem ${existing.display_order}`,
      );
      continue;
    }

    const firstAttempt = pipeline.stages.find(
      (stage) =>
        stage.code ===
        clientIdToStageCode(pipeline.client_id, "TENTATIVA_CONTATO"),
    );

    if (!firstAttempt) {
      missingFirstAttempt += 1;
      console.warn(
        `[ignorado] ${pipeline.client.company_name}: etapa TENTATIVA_CONTATO não encontrada`,
      );
      continue;
    }

    const targetOrder = firstAttempt.display_order + 1;
    console.log(
      `[${shouldApply ? "aplicar" : "simular"}] ${pipeline.client.company_name}: inserir na ordem ${targetOrder}`,
    );

    if (!shouldApply) continue;

    await prisma.$transaction(async (tx) => {
      const laterStages = await tx.crmStage.findMany({
        where: {
          pipeline_id: pipeline.id,
          display_order: { gte: targetOrder },
        },
        orderBy: { display_order: "desc" },
        select: { id: true, display_order: true },
      });

      for (const stage of laterStages) {
        await tx.crmStage.update({
          where: { id: stage.id },
          data: { display_order: stage.display_order + 1 },
        });
      }

      await tx.crmStage.create({
        data: {
          client_id: pipeline.client_id,
          pipeline_id: pipeline.id,
          code: stageCode,
          name: "Tentativa 2 - Email",
          display_order: targetOrder,
          color: "#0EA5E9",
          is_final_stage: false,
        },
      });
    });

    created += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        pipelines: pipelines.length,
        created,
        already_exists: alreadyExists,
        missing_first_attempt: missingFirstAttempt,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

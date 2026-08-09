import { Prisma, PrismaClient } from "@prisma/client";
import { deriveRubinhoConversationState } from "../modules/agent/rubinho-conversation-state";

const prisma = new PrismaClient();
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=") || "true"];
  }),
);
const apply = args.get("apply") === "true";
const confirmation = args.get("confirm");
const hours = Math.max(1, Number(args.get("hours") ?? 168));
const conversationId = args.get("conversation-id");
const clientId = args.get("client-id");

if (apply && confirmation !== "RECOVER_RUBINHO_STATE") {
  throw new Error(
    "Modo apply exige --confirm=RECOVER_RUBINHO_STATE. O padrao e dry-run.",
  );
}
if (apply && !conversationId && !clientId) {
  throw new Error(
    "Modo apply exige --conversation-id ou --client-id para limitar o escopo.",
  );
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}

function looksLikeName(value: string, leadName: string | null) {
  const normalized = value.trim();
  const normalizedLower = normalized.toLocaleLowerCase("pt-BR");
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  if (!words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/.test(word))) {
    return false;
  }
  const particles = new Set(["de", "da", "do", "das", "dos", "e"]);
  if (
    words.some((word) => {
      if (particles.has(word.toLocaleLowerCase("pt-BR"))) return false;
      return word[0] !== word[0]?.toLocaleUpperCase("pt-BR");
    })
  ) {
    return false;
  }
  if (
    /\b(esta|está|certo|correto|resumo|credenciamento|sim|nao|não|ok|beleza|obrigad[oa]|confirm[oa]|programa|governo|oferta|evento|carro|troca)\b/i.test(
      normalizedLower,
    )
  ) {
    return false;
  }
  return (
    normalizedLower !== leadName?.trim().toLocaleLowerCase("pt-BR")
  );
}

async function main() {
  const conversations = await prisma.conversation.findMany({
    where: {
      ...(conversationId ? { id: conversationId } : {}),
      ...(clientId ? { client_id: clientId } : {}),
      ...(!conversationId
        ? { last_message_at: { gte: new Date(Date.now() - hours * 3_600_000) } }
        : {}),
      lead: { deleted_at: null },
    },
    include: {
      lead: true,
      state: true,
      agent_action_logs: {
        where: {
          tool_name: {
            in: ["WAITING_COMPANIONS", "WAITING_COMPANION_NAMES"],
          },
          received_message: { not: null },
        },
        orderBy: { created_at: "desc" },
        take: 20,
      },
    },
    orderBy: { last_message_at: "desc" },
  });

  const proposals = [];
  for (const conversation of conversations) {
    let companions = conversation.lead.companions;
    let recoveredCompanions: string | null = null;
    const count = Number(companions?.trim().match(/^(\d+)$/)?.[1] ?? NaN);
    // Recuperacao automatica conservadora: com mais de um acompanhante nao
    // e seguro inferir se uma unica mensagem contem todos os nomes.
    if (Number.isInteger(count) && count === 1) {
      const candidate = conversation.agent_action_logs
        .map((log) => log.received_message?.trim() ?? "")
        .find((message) => looksLikeName(message, conversation.lead.name));
      if (candidate) {
        recoveredCompanions = `${count} acompanhante${count === 1 ? "" : "s"}: ${candidate}`;
        companions = recoveredCompanions;
      }
    }

    const previousPayload = jsonObject(conversation.state?.state_payload);
    const canonical = deriveRubinhoConversationState(
      { ...conversation.lead, companions },
      {
        handoffRequired: conversation.state?.handoff_required ?? false,
        previouslyCompleted: previousPayload.current_step === "COMPLETED",
      },
    );
    const previousStep = previousPayload.current_step ?? null;
    const terminalState = ["COMPLETED", "CANCELLED", "HUMAN_HANDOFF"].includes(
      String(previousStep ?? ""),
    );
    const stateChanged =
      previousStep !== canonical.current_step ||
      (!terminalState &&
        JSON.stringify(previousPayload.missing_fields ?? []) !==
          JSON.stringify(canonical.missing_fields));
    // Conversas antigas podem não possuir ConversationState. Isso, sozinho,
    // não é corrupção e não justifica um backfill amplo. Só propomos mudança
    // sem estado quando há um dado concreto recuperável no histórico.
    if ((!conversation.state || !stateChanged) && !recoveredCompanions) {
      continue;
    }

    proposals.push({
      conversation_id: conversation.id,
      client_id: conversation.client_id,
      lead_id: conversation.lead_id,
      lead_name: conversation.lead.name,
      previous_step: previousStep,
      proposed_step: canonical.current_step,
      recovered_companions: recoveredCompanions,
      missing_fields: canonical.missing_fields,
    });

    if (apply) {
      await prisma.$transaction(async (tx) => {
        if (recoveredCompanions) {
          await tx.lead.update({
            where: { id: conversation.lead_id },
            data: { companions: recoveredCompanions },
          });
        }
        const statePayload = {
          ...previousPayload,
          ...canonical,
          state_source: "rubinho_recovery_v3",
          recovered_at: new Date().toISOString(),
        } as Prisma.InputJsonValue;
        await tx.conversationState.upsert({
          where: { conversation_id: conversation.id },
          create: {
            conversation_id: conversation.id,
            client_id: conversation.client_id,
            lead_id: conversation.lead_id,
            awaiting_confirmation:
              canonical.current_step === "WAITING_FINAL_CONFIRMATION",
            last_agent_action: "state_recovered",
            state_payload: statePayload,
          },
          update: {
            awaiting_confirmation:
              canonical.current_step === "WAITING_FINAL_CONFIRMATION",
            last_agent_action: "state_recovered",
            state_payload: statePayload,
          },
        });
        await tx.agentActionLog.create({
          data: {
            conversation_id: conversation.id,
            client_id: conversation.client_id,
            lead_id: conversation.lead_id,
            trigger_type: "controlled_recovery",
            decision_type: "reconcile_persisted_state",
            action_payload: {
              recovered_companions: recoveredCompanions,
            },
            result_status: "completed",
            previous_state: previousPayload,
            next_stage: canonical.current_step,
            tool_name: "recover_rubinho_conversations",
            resulting_state: statePayload,
          },
        });
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        inspected: conversations.length,
        proposed_changes: proposals.length,
        proposals,
      },
      null,
      2,
    ),
  );
}

main().finally(() => prisma.$disconnect());

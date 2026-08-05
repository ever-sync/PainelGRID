import { ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";

const request = require("supertest");
import { AgentActionLogService } from "../src/modules/agent/agent-action-log.service";
import { AgentController } from "../src/modules/agent/agent.controller";
import { AgentService } from "../src/modules/agent/agent.service";
import { ConversationStateService } from "../src/modules/agent/conversation-state.service";
import { IntegrationKeyGuard } from "../src/modules/integration/integration-key.guard";

describe("Agent routes (integration)", () => {
  const apiKey = "test-integration-key-32chars!!";

  async function createApp() {
    const agentService = {
      getWhatsappContext: jest.fn().mockResolvedValue({ ok: true }),
      getEventsAvailability: jest.fn().mockResolvedValue({ ok: true }),
    };
    const agentActionLogService = {
      createActionLog: jest.fn().mockResolvedValue({ ok: true }),
      requestHandoff: jest.fn().mockResolvedValue({ ok: true }),
    };
    const conversationStateService = {
      updateState: jest.fn().mockResolvedValue({ ok: true }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              LEADFLOW_INTEGRATION_API_KEY: apiKey,
            }),
          ],
        }),
      ],
      controllers: [AgentController],
      providers: [
        IntegrationKeyGuard,
        { provide: AgentService, useValue: agentService },
        { provide: AgentActionLogService, useValue: agentActionLogService },
        {
          provide: ConversationStateService,
          useValue: conversationStateService,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    return {
      app,
      agentService,
      agentActionLogService,
      conversationStateService,
    };
  }

  it("GET /agent/whatsapp/context com conversation_id", async () => {
    const { app, agentService } = await createApp();

    await request(app.getHttpServer())
      .get("/api/agent/whatsapp/context")
      .set("X-Leadflow-Integration-Key", apiKey)
      .query({ conversation_id: "33333333-3333-4333-8333-333333333333" })
      .expect(200);

    expect(agentService.getWhatsappContext).toHaveBeenCalledWith({
      conversation_id: "33333333-3333-4333-8333-333333333333",
    });

    await app.close();
  });

  it("GET /agent/whatsapp/context exige ao menos um identificador", async () => {
    const { app } = await createApp();

    await request(app.getHttpServer())
      .get("/api/agent/whatsapp/context")
      .set("X-Leadflow-Integration-Key", apiKey)
      .expect(400);

    await app.close();
  });

  it("GET /agent/events/availability valida client_id", async () => {
    const { app, agentService } = await createApp();

    await request(app.getHttpServer())
      .get("/api/agent/events/availability")
      .set("X-Leadflow-Integration-Key", apiKey)
      .query({
        client_id: "11111111-1111-4111-8111-111111111111",
        lead_id: "22222222-2222-4222-8222-222222222222",
      })
      .expect(200);

    expect(agentService.getEventsAvailability).toHaveBeenCalledWith({
      client_id: "11111111-1111-4111-8111-111111111111",
      lead_id: "22222222-2222-4222-8222-222222222222",
    });

    await app.close();
  });

  it("GET /agent/events/availability sem chave retorna 401", async () => {
    const { app } = await createApp();

    await request(app.getHttpServer())
      .get("/api/agent/events/availability")
      .expect(401);

    await app.close();
  });

  it("POST /agent/conversations/:id/state persiste estado operacional", async () => {
    const { app, conversationStateService } = await createApp();
    const payload = {
      current_intent: "schedule_visit",
      awaiting_confirmation: true,
      last_agent_action: "offer_slots",
      state_payload: { step: "awaiting_confirmation" },
    };

    await request(app.getHttpServer())
      .post(
        "/api/agent/conversations/33333333-3333-4333-8333-333333333333/state",
      )
      .set("X-Leadflow-Integration-Key", apiKey)
      .send(payload)
      .expect(201);

    expect(conversationStateService.updateState).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      payload,
    );

    await app.close();
  });

  it("POST /agent/conversations/:id/action-logs registra auditoria do agente", async () => {
    const { app, agentActionLogService } = await createApp();
    const payload = {
      trigger_type: "incoming_message",
      decision_type: "classify_intent",
      confidence: 0.82,
      result_status: "completed",
    };

    await request(app.getHttpServer())
      .post(
        "/api/agent/conversations/33333333-3333-4333-8333-333333333333/action-logs",
      )
      .set("X-Leadflow-Integration-Key", apiKey)
      .send(payload)
      .expect(201);

    expect(agentActionLogService.createActionLog).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      payload,
    );

    await app.close();
  });

  it("POST /agent/conversations/:id/handoff abre handoff formal", async () => {
    const { app, agentActionLogService } = await createApp();
    const payload = {
      reason: "lead pediu atendimento humano",
      confidence: 0.31,
    };

    await request(app.getHttpServer())
      .post(
        "/api/agent/conversations/33333333-3333-4333-8333-333333333333/handoff",
      )
      .set("X-Leadflow-Integration-Key", apiKey)
      .send(payload)
      .expect(201);

    expect(agentActionLogService.requestHandoff).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      payload,
    );

    await app.close();
  });
});

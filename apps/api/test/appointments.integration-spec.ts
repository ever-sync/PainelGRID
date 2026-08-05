import { ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";

const request = require("supertest");
import { AppointmentsController } from "../src/modules/appointments/appointments.controller";
import { AppointmentsService } from "../src/modules/appointments/appointments.service";
import { IntegrationKeyGuard } from "../src/modules/integration/integration-key.guard";

describe("Appointments agent routes (integration)", () => {
  const apiKey = "test-integration-key-32chars!!";
  const appointmentId = "44444444-4444-4444-8444-444444444444";

  async function createApp() {
    const appointmentsService = {
      create: jest.fn().mockResolvedValue({ id: appointmentId }),
      confirm: jest.fn().mockResolvedValue({ confirmed: true }),
      reschedule: jest.fn().mockResolvedValue({ rescheduled: true }),
      cancel: jest.fn().mockResolvedValue({ cancelled: true }),
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
      controllers: [AppointmentsController],
      providers: [
        IntegrationKeyGuard,
        { provide: AppointmentsService, useValue: appointmentsService },
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

    return { app, appointmentsService };
  }

  it("POST /agent/appointments encaminha payload e Idempotency-Key", async () => {
    const { app, appointmentsService } = await createApp();
    const payload = {
      lead_id: "11111111-1111-4111-8111-111111111111",
      event_id: "22222222-2222-4222-8222-222222222222",
      scheduled_at: "2026-04-24T14:00:00-03:00",
    };

    await request(app.getHttpServer())
      .post("/api/agent/appointments")
      .set("X-Leadflow-Integration-Key", apiKey)
      .set("Idempotency-Key", "idem-appointments-create")
      .send(payload)
      .expect(201);

    expect(appointmentsService.create).toHaveBeenCalledWith(
      payload,
      "idem-appointments-create",
    );

    await app.close();
  });

  it("POST /agent/appointments/:id/confirm encaminha Idempotency-Key", async () => {
    const { app, appointmentsService } = await createApp();

    await request(app.getHttpServer())
      .post(`/api/agent/appointments/${appointmentId}/confirm`)
      .set("X-Leadflow-Integration-Key", apiKey)
      .set("Idempotency-Key", "idem-appointments-confirm")
      .send({ notes: "Confirmado" })
      .expect(201);

    expect(appointmentsService.confirm).toHaveBeenCalledWith(
      appointmentId,
      { notes: "Confirmado" },
      "idem-appointments-confirm",
    );

    await app.close();
  });

  it("POST /agent/appointments/:id/reschedule valida payload", async () => {
    const { app, appointmentsService } = await createApp();

    await request(app.getHttpServer())
      .post(`/api/agent/appointments/${appointmentId}/reschedule`)
      .set("X-Leadflow-Integration-Key", apiKey)
      .send({ scheduled_at: "2026-04-26T14:00:00-03:00" })
      .expect(201);

    expect(appointmentsService.reschedule).toHaveBeenCalledWith(
      appointmentId,
      { scheduled_at: "2026-04-26T14:00:00-03:00" },
      undefined,
    );

    await app.close();
  });

  it("POST /agent/appointments/:id/cancel sem chave retorna 401", async () => {
    const { app } = await createApp();

    await request(app.getHttpServer())
      .post(`/api/agent/appointments/${appointmentId}/cancel`)
      .send({ reason: "Cliente desistiu" })
      .expect(401);

    await app.close();
  });
});

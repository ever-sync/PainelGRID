import { OperationsService } from "./operations.service";

describe("OperationsService", () => {
  const prisma = {
    operationalIssue: { upsert: jest.fn() },
    operationalHeartbeat: { upsert: jest.fn() },
  };
  let service: OperationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsService(prisma as never);
  });

  it("deduplica ocorrências pelo fingerprint e incrementa recorrência", async () => {
    prisma.operationalIssue.upsert.mockResolvedValue({ id: "issue-1" });
    await service.report({
      type: "QR_NOT_DELIVERED",
      severity: "critical",
      title: "QR Code não entregue",
      message: "Falha Meta",
      source: "n8n",
      fingerprint: "qr:lead-1",
    });

    expect(prisma.operationalIssue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fingerprint: "qr:lead-1" },
        update: expect.objectContaining({
          status: "open",
          occurrence_count: { increment: 1 },
        }),
      }),
    );
  });

  it("atualiza heartbeat sem criar eventos duplicados", async () => {
    prisma.operationalHeartbeat.upsert.mockResolvedValue({
      name: "rubinho-v2",
    });
    await service.heartbeat({ name: "rubinho-v2", status: "healthy" });
    expect(prisma.operationalHeartbeat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: "rubinho-v2" },
        update: expect.objectContaining({ status: "healthy" }),
      }),
    );
  });
});

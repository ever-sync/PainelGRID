import { ScoreEventsService } from "./score-events.service";

describe("ScoreEventsService", () => {
  it("atualiza os pontos ao reaplicar um marco ja existente", async () => {
    const prisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue({
          settings: {
            score_rules: {
              scheduled_points: 0,
              checkin_points: 5,
              sold_points: 8,
            },
          },
        }),
      },
      scoreEvent: { upsert: jest.fn().mockResolvedValue({ id: "score-1" }) },
    };
    const service = new ScoreEventsService(prisma as never);

    await service.award({
      client_id: "client-1",
      vendor_id: "vendor-1",
      lead_id: "lead-1",
      kind: "checked_in",
    });

    expect(prisma.scoreEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ points: 5 }),
        update: expect.objectContaining({ points: 5 }),
      }),
    );
  });

  it("deve montar ranking com totais, campos do time e limite", async () => {
    const prisma = {
      scoreEvent: {
        groupBy: jest.fn().mockResolvedValue([
          {
            vendor_id: "v1",
            kind: "scheduled",
            _sum: { points: 2 },
            _count: { _all: 2 },
          },
          {
            vendor_id: "v1",
            kind: "checked_in",
            _sum: { points: 4 },
            _count: { _all: 2 },
          },
          {
            vendor_id: "v1",
            kind: "sold",
            _sum: { points: 7 },
            _count: { _all: 1 },
          },
          {
            vendor_id: "v2",
            kind: "scheduled",
            _sum: { points: 1 },
            _count: { _all: 1 },
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: "v1", name: "Alice" },
          { id: "v2", name: "Bruno" },
        ]),
      },
      lead: {
        groupBy: jest.fn().mockResolvedValue([
          { assigned_vendor_id: "v1", _count: { _all: 10 } },
          { assigned_vendor_id: "v2", _count: { _all: 5 } },
        ]),
      },
    };

    const service = new ScoreEventsService(prisma as never);
    const ranking = await service.rankingForClient({
      clientId: "c1",
      limit: 1,
    });

    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toEqual({
      vendor_id: "v1",
      vendor_name: "Alice",
      total_points: 13,
      assigned: 10,
      visits: 2,
      sales: 1,
      scheduled: { points: 2, count: 2 },
      checked_in: { points: 4, count: 2 },
      sold: { points: 7, count: 1 },
      contacted: { points: 0, count: 0 },
    });
  });
});

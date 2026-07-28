import { Test } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { PerformanceService } from './performance.service';

describe('PerformanceService', () => {
  const prisma = {
    webVitalMetric: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    apiRequestMetric: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let service: PerformanceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.webVitalMetric.upsert.mockResolvedValue({});
    prisma.apiRequestMetric.createMany.mockResolvedValue({ count: 1 });
    prisma.$queryRaw.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PerformanceService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(PerformanceService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('persiste Web Vital anônimo com caminho normalizado', async () => {
    await service.recordWebVital(
      {
        name: 'LCP',
        value: 1_850,
        rating: 'good',
        delta: 1_850,
        id: 'v4-123',
        navigationType: 'navigate',
        path: 'dashboard?tab=events',
        recordedAt: new Date().toISOString(),
        sessionId: 'session-123',
        viewport: 'desktop',
      },
      {
        get: jest.fn().mockReturnValue('Test Browser'),
      } as never,
    );

    expect(prisma.webVitalMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metric_name: 'LCP',
          path: '/dashboard',
          user_agent: 'Test Browser',
        }),
      }),
    );
  });

  it('mantém todas as requisições lentas na amostragem', async () => {
    service.enqueueApiRequest({
      request_id: 'request-1',
      method: 'GET',
      path: '/api/events',
      status_code: 200,
      duration_ms: 900,
      database_duration_ms: 300,
      database_query_count: 2,
      slowest_query_ms: 220,
      is_slow: true,
    });

    await service.onModuleDestroy();

    expect(prisma.apiRequestMetric.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          request_id: 'request-1',
          is_slow: true,
        }),
      ],
    });
  });

  it('retorna resumo de Web Vitals com meta p75', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        name: 'LCP',
        samples: 12,
        p75: 2_100,
        p95: 3_200,
        good: 10,
        needs_improvement: 1,
        poor: 1,
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const summary = await service.getWebVitalsSummary({ hours: 24 });

    expect(summary.metrics[0]).toMatchObject({
      name: 'LCP',
      p75: 2_100,
      target: 2_500,
      status: 'good',
    });
  });
});

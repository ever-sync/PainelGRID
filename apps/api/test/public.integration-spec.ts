import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

const request = require('supertest');
import { PrismaService } from '../src/config/prisma.service';
import { signCheckinVoucher, verifyCheckinVoucher } from '../src/common/checkin-voucher.util';
import { PublicController } from '../src/modules/public/public.controller';
import { PublicService } from '../src/modules/public/public.service';

describe('GET /api/public/check-in/preview (integration)', () => {
  const secret = 'integration-test-jwt-secret';
  const leadId = '11111111-1111-4111-8111-111111111111';
  const clientId = '22222222-2222-4222-8222-222222222222';
  const checkinToken = 'a'.repeat(48);

  const mockPrisma = {
    lead: {
      findFirst: jest.fn().mockResolvedValue({
        name: 'Maria Demo',
        client: { company_name: 'Empresa Demo' },
        event_interest: { name: 'Evento Demo' },
      }),
    },
  };

  it('retorna preview com JWT valido', async () => {
    const configStub = {
      get: (key: string, defaultValue?: string) => {
        if (key === 'JWT_SECRET') return secret;
        if (key === 'LEADFLOW_CHECKIN_VOUCHER_SECRET') return undefined;
        return defaultValue;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        PublicService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: configStub },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const jwt = signCheckinVoucher(secret, leadId, clientId, checkinToken, 3600);
    expect(verifyCheckinVoucher(secret, jwt)).toBeTruthy();

    const res = await request(app.getHttpServer())
      .get('/api/public/check-in/preview')
      .query({ v: jwt });
    expect(res.status).toBe(200);

    expect(res.body).toMatchObject({
      lead_first_name: 'Maria',
      company_name: 'Empresa Demo',
      event_name: 'Evento Demo',
    });

    await app.close();
  });
});

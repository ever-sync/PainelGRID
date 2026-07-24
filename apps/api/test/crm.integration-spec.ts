import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';

const request = require('supertest');
import { Role } from '../src/common/types';
import { CrmController } from '../src/modules/crm/crm.controller';
import { CrmService } from '../src/modules/crm/crm.service';

describe('POST /api/crm/leads/:leadId/move (integration)', () => {
  const leadId = '44444444-4444-4444-8444-444444444444';
  const mockMove = jest.fn().mockResolvedValue({ ok: true, lead_id: leadId });

  it('chama CrmService.moveLeadByCodes com usuario autenticado (mock request.user)', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CrmController],
      providers: [{ provide: CrmService, useValue: { moveLeadByCodes: mockMove } }],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: object }).user = {
        sub: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor Demo',
        role: Role.GESTOR,
        client_id: null,
      };
      next();
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const res = await request(app.getHttpServer())
      .post(`/api/crm/leads/${leadId}/move`)
      .send({ pipeline_code: 'PIPE_DEMO1', stage_code: 'STG_DEMO1' });

    expect(res.status).toBe(201);
    expect(mockMove).toHaveBeenCalled();

    await app.close();
  });
});

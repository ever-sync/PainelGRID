import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';

const request = require('supertest');
import { ClientsController } from '../src/modules/clients/clients.controller';
import { ClientsService } from '../src/modules/clients/clients.service';
import { CoursesController } from '../src/modules/courses/courses.controller';
import { CoursesService } from '../src/modules/courses/courses.service';
import { CrmController } from '../src/modules/crm/crm.controller';
import { CrmService } from '../src/modules/crm/crm.service';

describe('Remaining traceability endpoints (integration)', () => {
  const clientId = '22222222-2222-4222-8222-222222222222';
  const vendorId = '33333333-3333-4333-8333-333333333333';

  async function createApp() {
    const mockClients = {
      create: jest.fn().mockResolvedValue({ id: clientId, company_name: 'Empresa Nova' }),
    };
    const mockCrm = {
      getDashboardReport: jest.fn().mockResolvedValue({ kpis: {} }),
    };
    const mockCourses = {
      listPublished: jest.fn().mockResolvedValue([{ id: 'course-1', title: 'Curso Demo' }]),
      progressForVendor: jest.fn().mockResolvedValue([{ course_id: 'course-1', progress: 100 }]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ClientsController, CrmController, CoursesController],
      providers: [
        { provide: ClientsService, useValue: mockClients },
        { provide: CrmService, useValue: mockCrm },
        { provide: CoursesService, useValue: mockCourses },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: object }).user = {
        sub: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        email: 'gestor@demo.com',
        name: 'Gestor Demo',
        role: 'gestor',
        client_id: clientId,
      };
      next();
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    return { app, mockClients, mockCrm, mockCourses };
  }

  it('POST /api/clients cria cliente', async () => {
    const { app, mockClients } = await createApp();

    await request(app.getHttpServer())
      .post('/api/clients')
      .send({ company_name: 'Empresa Nova' })
      .expect(201);
    expect(mockClients.create).toHaveBeenCalled();

    await app.close();
  });

  it('GET /api/crm/reports/dashboard retorna relatório', async () => {
    const { app, mockCrm } = await createApp();

    await request(app.getHttpServer())
      .get('/api/crm/reports/dashboard')
      .query({ client_id: clientId })
      .expect(200);
    expect(mockCrm.getDashboardReport).toHaveBeenCalled();

    await app.close();
  });

  it('GET /api/courses e /api/courses/progress/vendor retornam cursos e progresso', async () => {
    const { app, mockCourses } = await createApp();

    await request(app.getHttpServer()).get('/api/courses').expect(200);
    await request(app.getHttpServer())
      .get('/api/courses/progress/vendor')
      .query({ vendor_id: vendorId })
      .expect(200);

    expect(mockCourses.listPublished).toHaveBeenCalled();
    expect(mockCourses.progressForVendor).toHaveBeenCalled();

    await app.close();
  });
});

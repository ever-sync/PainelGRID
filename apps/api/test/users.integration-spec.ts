import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";

const request = require("supertest");
import { Role, VendorCategory } from "../src/common/types";
import { ClientStaffController } from "../src/modules/users/client-staff.controller";
import { UsersController } from "../src/modules/users/users.controller";
import { UsersService } from "../src/modules/users/users.service";

describe("Users modules (integration)", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const clientId = "22222222-2222-4222-8222-222222222222";

  async function createApp() {
    const mockUsers = {
      findAll: jest
        .fn()
        .mockResolvedValue([{ id: userId, email: "vendedor@demo.com" }]),
      create: jest
        .fn()
        .mockResolvedValue({ id: userId, email: "vendedor@demo.com" }),
      findById: jest.fn().mockResolvedValue({ id: userId }),
      update: jest.fn().mockResolvedValue({ id: userId }),
      setActive: jest.fn().mockResolvedValue({ id: userId, is_active: true }),
      remove: jest.fn().mockResolvedValue({ deleted: true }),
      findStaffByClient: jest
        .fn()
        .mockResolvedValue([{ id: userId, role: Role.VENDEDOR }]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController, ClientStaffController],
      providers: [{ provide: UsersService, useValue: mockUsers }],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: object }).user = {
        sub: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        email: "gestor@demo.com",
        name: "Gestor Demo",
        role: Role.GESTOR,
        client_id: null,
      };
      next();
    });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    return { app, mockUsers };
  }

  it("GET /api/users retorna lista", async () => {
    const { app, mockUsers } = await createApp();
    await request(app.getHttpServer()).get("/api/users").expect(200);
    expect(mockUsers.findAll).toHaveBeenCalled();
    await app.close();
  });

  it("POST /api/users cria usuario", async () => {
    const { app, mockUsers } = await createApp();
    await request(app.getHttpServer())
      .post("/api/users")
      .send({
        name: "Vendedor Demo",
        email: "vendedor@demo.com",
        password: "VendedorDemo2024",
        role: Role.VENDEDOR,
        client_id: clientId,
        vendor_categories: [VendorCategory.NOVO],
      })
      .expect(201);
    expect(mockUsers.create).toHaveBeenCalled();
    await app.close();
  });

  it("POST /api/users reprova senha fraca (validacao)", async () => {
    const { app } = await createApp();
    await request(app.getHttpServer())
      .post("/api/users")
      .send({
        name: "X",
        email: "x@demo.com",
        password: "senha1234",
        role: Role.VENDEDOR,
        client_id: clientId,
        vendor_categories: [VendorCategory.NOVO],
      })
      .expect(400);
    await app.close();
  });

  it("PUT /api/users/:id atualiza usuario", async () => {
    const { app, mockUsers } = await createApp();
    await request(app.getHttpServer())
      .put(`/api/users/${userId}`)
      .send({ name: "Novo Nome" })
      .expect(200);
    expect(mockUsers.update).toHaveBeenCalledWith(
      userId,
      { name: "Novo Nome" },
      expect.objectContaining({ role: Role.GESTOR }),
    );
    await app.close();
  });

  it("PATCH /api/users/:id/active altera status", async () => {
    const { app, mockUsers } = await createApp();
    await request(app.getHttpServer())
      .patch(`/api/users/${userId}/active`)
      .send({ is_active: true })
      .expect(200);
    expect(mockUsers.setActive).toHaveBeenCalledWith(
      userId,
      true,
      expect.objectContaining({ role: Role.GESTOR }),
    );
    await app.close();
  });

  it("DELETE /api/users/:id exclui usuario", async () => {
    const { app, mockUsers } = await createApp();
    await request(app.getHttpServer())
      .delete(`/api/users/${userId}`)
      .expect(200);
    expect(mockUsers.remove).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ role: Role.GESTOR }),
    );
    await app.close();
  });

  it("GET /api/client-staff?client_id retorna staff do cliente", async () => {
    const { app, mockUsers } = await createApp();
    await request(app.getHttpServer())
      .get("/api/client-staff")
      .query({ client_id: clientId })
      .expect(200);
    expect(mockUsers.findStaffByClient).toHaveBeenCalled();
    await app.close();
  });
});

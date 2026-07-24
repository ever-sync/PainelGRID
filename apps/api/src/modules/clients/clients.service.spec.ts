/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/types';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  const clientId = '33333333-3333-4333-8333-333333333333';
  const gestorId = 'gestor-1';

  let prisma: any;
  let redis: any;
  let service: ClientsService;

  beforeEach(() => {
    prisma = {
      client: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    redis = {
      client: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      },
    };

    service = new ClientsService(prisma, redis);
  });

  describe('assertGestorOwnsClient', () => {
    it('cache hit: retorna sem consultar Postgres', async () => {
      const cached = { id: clientId, gestor_id: gestorId, company_name: 'Acme' };
      redis.client.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.assertGestorOwnsClient(gestorId, clientId);

      expect(redis.client.get).toHaveBeenCalledWith(`clients:owner:${gestorId}:${clientId}`);
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: clientId });
    });

    it('cache miss: consulta DB e popula cache', async () => {
      redis.client.get.mockResolvedValue(null);
      prisma.client.findFirst.mockResolvedValue({ id: clientId, gestor_id: gestorId });

      await service.assertGestorOwnsClient(gestorId, clientId);

      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { id: clientId, gestor_id: gestorId },
      });
      expect(redis.client.set).toHaveBeenCalledWith(
        `clients:owner:${gestorId}:${clientId}`,
        expect.any(String),
        'EX',
        300,
      );
    });

    it('cliente sem ownership: lança ForbiddenException e não cacheia', async () => {
      redis.client.get.mockResolvedValue(null);
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.assertGestorOwnsClient(gestorId, clientId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(redis.client.set).not.toHaveBeenCalled();
    });

    it('falha de Redis no get: cai para o DB sem propagar erro', async () => {
      redis.client.get.mockRejectedValue(new Error('redis down'));
      prisma.client.findFirst.mockResolvedValue({ id: clientId, gestor_id: gestorId });

      const result = await service.assertGestorOwnsClient(gestorId, clientId);
      expect(result).toMatchObject({ id: clientId });
    });
  });

  describe('findAllForUser', () => {
    it('VENDEDOR: bloqueia (não previsto na regra)', async () => {
      await expect(
        service.findAllForUser({
          sub: 'v',
          role: Role.VENDEDOR,
          email: 'v@x',
          name: 'V',
          client_id: clientId,
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('CLIENTE sem client_id: bloqueia', async () => {
      await expect(
        service.findAllForUser({
          sub: 'c',
          role: Role.CLIENTE,
          email: 'c@x',
          name: 'C',
          client_id: null,
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

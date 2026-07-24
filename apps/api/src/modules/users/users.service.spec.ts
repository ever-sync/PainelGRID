/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { Role, VendorCategory } from '../../common/types';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: any;
  let service: UsersService;

  const gestorId = 'gestor-1';
  const clientId = 'client-1';
  const baseUser = {
    id: 'user-1',
    name: 'Joao',
    email: 'joao@demo.com',
    password_hash: 'hash',
    role: Role.VENDEDOR,
    vendor_category: VendorCategory.NOVO,
    avatar_url: null,
    phone: null,
    is_active: true,
    created_at: new Date('2026-05-01T10:00:00.000Z'),
    updated_at: new Date('2026-05-01T10:00:00.000Z'),
    client_id: clientId,
    meta_gestor_access_token: null,
    meta_gestor_token_expires_at: null,
    meta_gestor_scopes: [],
    meta_gestor_connected_at: null,
  };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      client: {
        findFirst: jest.fn(),
      },
      salesTeamMember: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) => callback(prisma)),
    };
    service = new UsersService(prisma, { sendWelcome: jest.fn() } as any);
    jest.spyOn(service as any, 'ensureClientOwnedByGestor').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'ensureGestorCanManageUser').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cria vendedor com categoria obrigatoria', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(baseUser);

    await service.create(
      {
        name: 'Joao',
        email: 'joao@demo.com',
        password: 'SenhaForte123',
        role: Role.VENDEDOR,
        client_id: clientId,
        vendor_category: VendorCategory.PDC,
      } as never,
      gestorId,
    );

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendor_category: VendorCategory.PDC,
        }),
      }),
    );
  });

  it('rejeita vendedor sem categoria', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          name: 'Joao',
          email: 'joao@demo.com',
          password: 'SenhaForte123',
          role: Role.VENDEDOR,
          client_id: clientId,
        } as never,
        gestorId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limpa categoria ao transformar vendedor em recepcao', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      role: Role.RECEPCAO,
      vendor_category: null,
    });

    await service.update(
      'user-1',
      {
        role: Role.RECEPCAO,
      } as never,
      { sub: gestorId, role: Role.GESTOR, email: 'g@demo.com', name: 'Gestor' } as never,
    );

    expect(prisma.salesTeamMember.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendor_category: null,
        }),
      }),
    );
  });
});

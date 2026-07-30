/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
        count: jest.fn().mockResolvedValue(0),
      },
      client: {
        findFirst: jest.fn(),
      },
      salesTeamMember: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) => callback(prisma)),
    };
    service = new UsersService(
      prisma,
      { sendWelcome: jest.fn() } as any,
      { isEnabled: false, upload: jest.fn(), download: jest.fn() } as any,
      {
        issueSetupToken: jest.fn().mockResolvedValue('setup-token'),
        peekSetupToken: jest.fn(),
        consumeSetupToken: jest.fn(),
      } as any,
    );
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

  describe('createSelfSignupVendor', () => {
    const otherClientId = 'client-2';
    const signupDto = {
      name: '  Raphael Silva  ',
      email: '  Raphael@Empresa.com  ',
      phone: '11999998888',
      vendor_categories: [VendorCategory.NOVO],
    };

    it('cria pendente, sem senha e sem acesso', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(baseUser);

      const result = await service.createSelfSignupVendor(clientId, signupDto);

      expect(result).toEqual({ received: true });
      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.password_hash).toBeNull();
      expect(data.is_active).toBe(false);
      expect(data.approval_status).toBe('pending');
      expect(data.client_id).toBe(clientId);
      expect(data.email).toBe('raphael@empresa.com');
      expect(data.name).toBe('Raphael Silva');
      expect(data.rating_token).toMatch(/^[a-f0-9]{32}$/);
    });

    it('reabre solicitacao recusada do mesmo cliente', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        client_id: clientId,
        approval_status: 'rejected',
      });

      const result = await service.createSelfSignupVendor(clientId, signupDto);

      expect(result).toEqual({ received: true });
      expect(prisma.user.create).not.toHaveBeenCalled();
      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.approval_status).toBe('pending');
      expect(data.is_active).toBe(false);
    });

    it('nao toca em usuario de outra empresa e responde igual', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        client_id: otherClientId,
        approval_status: 'approved',
      });

      const result = await service.createSelfSignupVendor(clientId, signupDto);

      expect(result).toEqual({ received: true });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('nao reabre quem ja esta aprovado no mesmo cliente', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        client_id: clientId,
        approval_status: 'approved',
      });

      await service.createSelfSignupVendor(clientId, signupDto);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('recusa quando ha pendentes demais na empresa', async () => {
      prisma.user.count.mockResolvedValue(200);

      await expect(
        service.createSelfSignupVendor(clientId, signupDto),
      ).rejects.toThrow();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('exige ao menos uma categoria', async () => {
      await expect(
        service.createSelfSignupVendor(clientId, {
          ...signupDto,
          vendor_categories: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('setApprovalStatus', () => {
    const pendingVendor = {
      ...baseUser,
      approval_status: 'pending',
      is_active: false,
    };

    const actor = (role: Role, overrides: Record<string, unknown> = {}) =>
      ({
        sub: 'actor-1',
        role,
        email: 'a@demo.com',
        name: 'Actor',
        ...overrides,
      }) as never;

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(pendingVendor);
      prisma.user.update.mockResolvedValue({
        ...pendingVendor,
        approval_status: 'approved',
        is_active: true,
      });
    });

    it('ativa o usuario ao aprovar e registra quem aprovou', async () => {
      const result = await service.setApprovalStatus(
        actor(Role.GESTOR),
        'user-1',
        'approved',
      );

      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.approval_status).toBe('approved');
      expect(data.is_active).toBe(true);
      expect(data.approved_by_id).toBe('actor-1');
      expect(data.approved_at).toBeInstanceOf(Date);
      expect(result.email_sent).toBe(false);
    });

    it('mantem inativo ao recusar', async () => {
      await service.setApprovalStatus(actor(Role.GESTOR), 'user-1', 'rejected');

      const { data } = prisma.user.update.mock.calls[0][0];
      expect(data.approval_status).toBe('rejected');
      expect(data.is_active).toBe(false);
      expect(data.approved_by_id).toBeUndefined();
    });

    it('permite o cliente aprovar alguem da propria empresa', async () => {
      await service.setApprovalStatus(
        actor(Role.CLIENTE, { client_id: clientId }),
        'user-1',
        'approved',
      );
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('bloqueia cliente de outra empresa', async () => {
      await expect(
        service.setApprovalStatus(
          actor(Role.CLIENTE, { client_id: 'client-outro' }),
          'user-1',
          'approved',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('bloqueia vendedor e recepcao', async () => {
      for (const role of [Role.VENDEDOR, Role.RECEPCAO]) {
        await expect(
          service.setApprovalStatus(
            actor(role, { client_id: clientId }),
            'user-1',
            'approved',
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('nao aprova gestor nem acesso de cliente', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...pendingVendor,
        role: Role.CLIENTE,
      });

      await expect(
        service.setApprovalStatus(actor(Role.GESTOR), 'user-1', 'approved'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

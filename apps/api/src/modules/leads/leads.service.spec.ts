import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfirmationStatus, LeadSource } from '@prisma/client';
import { Role } from '../../common/types';
import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  const clientId = '22222222-2222-4222-8222-222222222222';
  const partnerClientId = '33333333-3333-4333-8333-333333333333';
  const gestorId = '11111111-1111-4111-8111-111111111111';
  const vendorId = '44444444-4444-4444-8444-444444444444';
  const eventId = '55555555-5555-4555-8555-555555555555';
  const teamId = '66666666-6666-4666-8666-666666666666';

  let prisma: {
    lead: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      createMany: jest.Mock;
    };
    crmStage: { findFirst: jest.Mock; findUnique: jest.Mock };
    crmPipeline: { findFirst: jest.Mock };
    crmHistory: { create: jest.Mock };
    event: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    salesTeamMember: { findFirst: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let clientsService: {
    assertGestorOwnsClient: jest.Mock;
  };
  let service: LeadsService;

  beforeEach(() => {
    prisma = {
      lead: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
      },
      crmStage: { findFirst: jest.fn(), findUnique: jest.fn() },
      crmPipeline: { findFirst: jest.fn() },
      crmHistory: { create: jest.fn() },
      event: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      salesTeamMember: { findFirst: jest.fn() },
      $queryRaw: jest.fn(),
    };
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.createMany.mockResolvedValue({ count: 0 });
    prisma.crmStage.findFirst.mockResolvedValue(null);
    prisma.crmStage.findUnique.mockResolvedValue(null);
    prisma.crmPipeline.findFirst.mockResolvedValue(null);
    prisma.crmHistory.create.mockResolvedValue({ id: 'hist-1' });
    prisma.event.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([]);
    clientsService = {
      assertGestorOwnsClient: jest.fn(),
    };

    service = new LeadsService(
      prisma as never,
      clientsService as never,
      { get: jest.fn() } as never,
      { awardWithTx: jest.fn() } as never,
      { emitLeadCheckin: jest.fn(), emitLeadUpdated: jest.fn(), emitVendorCalled: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
      {
        sendClientWhatsappMessage: jest.fn(),
        sendClientWhatsappMediaMessage: jest.fn(),
      } as never,
      { record: jest.fn(), originFromSource: jest.fn(() => 'crm') } as never,
      {
        client: {
          set: jest.fn().mockResolvedValue('OK'),
        },
      } as never,
    );
  });

  it('exporta CSV com cabeçalho e linha de lead', async () => {
    prisma.lead.findMany.mockResolvedValue([
      {
        id: 'lead-1',
        client_id: clientId,
        name: 'Lead Teste',
        email: 'lead@teste.com',
        phone: '11999999999',
        source: LeadSource.manual,
        tags: ['vip', 'quente'],
        crm_pipeline_id: null,
        crm_stage_id: null,
        crm_stage: { id: 'stage-1', code: 'LEAD_NOVO', name: 'Novo' },
        event_interest: { id: 'event-1', name: 'Evento XPTO' },
        event_interest_id: 'event-1',
        confirmation_status: 'pending',
        notes: 'Observacao',
        created_at: new Date('2026-05-03T12:00:00.000Z'),
        appointments: [],
      },
    ]);

    const csv = await service.exportCsv(
      {
        sub: gestorId,
        role: Role.GESTOR,
        name: 'Gestor',
        email: 'gestor@teste.com',
        client_id: null,
      },
      {
        client_id: clientId,
      },
    );

    expect(csv).toContain('id,client_id,name,email,phone,source');
    expect(csv).toContain('Lead Teste');
    expect(csv).toContain('LEAD_NOVO');
    expect(csv).toContain('vip|quente');
    expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith(gestorId, clientId);
  });

  it('importa CSV para cliente do gestor usando createMany em batch', async () => {
    prisma.lead.createMany.mockResolvedValue({ count: 1 });

    const result = await service.importCsv(
      {
        sub: gestorId,
        role: Role.GESTOR,
        name: 'Gestor',
        email: 'gestor@teste.com',
        client_id: null,
      },
      { client_id: clientId },
      {
        buffer: Buffer.from(
          'name,email,phone,source,tags,notes\nLead Um,lead@um.com,11911111111,manual,vip|novo,Obs',
          'utf8',
        ),
      },
    );

    expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith(gestorId, clientId);
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            client_id: clientId,
            name: 'Lead Um',
            source: LeadSource.manual,
            tags: ['vip', 'novo'],
          }),
        ]),
        skipDuplicates: true,
      }),
    );
    expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
  });

  it('rejeita arquivo com extensao XLSX sem assinatura ZIP', async () => {
    await expect(
      service.importCsv(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: 'Gestor',
          email: 'gestor@teste.com',
          client_id: null,
        },
        { client_id: clientId },
        {
          buffer: Buffer.from('conteudo falso'),
          originalname: 'leads.xlsx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ),
    ).rejects.toThrow('Arquivo XLSX invalido');
  });

  it('importa CSV ignorando linhas com telefone ja existente (bulk dedup)', async () => {
    prisma.lead.findMany.mockResolvedValue([{ phone: '+5511911111111' }]);
    prisma.lead.createMany.mockResolvedValue({ count: 1 });

    const result = await service.importCsv(
      { sub: 'vendor-1', role: Role.VENDEDOR, name: 'V', email: 'v@x', client_id: clientId },
      {},
      {
        buffer: Buffer.from('name,phone\nLead Dup,11911111111\nLead Novo,11922222222', 'utf8'),
      },
    );

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.errors[0]).toContain('telefone ja cadastrado');
  });

  it('bloqueia importacao de gestor sem client_id', async () => {
    await expect(
      service.importCsv(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: 'Gestor',
          email: 'gestor@teste.com',
          client_id: null,
        },
        {},
        {
          buffer: Buffer.from('name\nLead', 'utf8'),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia importacao com source invalido', async () => {
    const result = await service.importCsv(
      {
        sub: 'vendor-1',
        role: Role.VENDEDOR,
        name: 'Vendedor',
        email: 'vend@teste.com',
        client_id: clientId,
      },
      {},
      {
        buffer: Buffer.from('name,source\nLead Invalido,nao_existe', 'utf8'),
      },
    );

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.createMany).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('source invalido');
  });

  it('bloqueia criacao de lead com telefone duplicado', async () => {
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    await expect(
      service.create(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: 'Gestor',
          email: 'gestor@teste.com',
          client_id: null,
        },
        {
          client_id: clientId,
          name: 'Novo Lead',
          phone: '11999999999',
          source: LeadSource.manual,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('bloqueia vendedor quando o telefone ja esta cadastrado no mesmo evento', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: vendorId,
      client_id: clientId,
    });
    prisma.salesTeamMember.findFirst.mockResolvedValue({ team_id: teamId });
    prisma.event.findFirst.mockResolvedValue({ id: eventId });
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    await expect(
      service.create(
        {
          sub: vendorId,
          role: Role.VENDEDOR,
          name: 'Vendedor',
          email: 'vend@teste.com',
          client_id: clientId,
        },
        {
          client_id: clientId,
          name: 'Lead repetido',
          phone: '11999999999',
          source: LeadSource.manual,
          event_interest_id: eventId,
        } as never,
      ),
    ).rejects.toThrow('Telefone ja cadastrado neste evento');

    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client_id: clientId,
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { event_interest_id: eventId },
                { appointments: { some: { event_id: eventId } } },
              ]),
            }),
          ]),
        }),
      }),
    );
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('cria lead do vendedor já vinculado ao time do evento', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: vendorId,
      client_id: clientId,
    });
    prisma.salesTeamMember.findFirst.mockResolvedValue({ team_id: teamId });
    prisma.event.findFirst.mockResolvedValue({ id: eventId });
    prisma.lead.create.mockResolvedValue({
      ...baseExistingLead,
      id: 'lead-vendor',
      client_id: clientId,
      event_interest_id: eventId,
      assigned_vendor_id: vendorId,
      team_id: teamId,
    });

    await service.create(
      {
        sub: vendorId,
        role: Role.VENDEDOR,
        name: 'Vendedor',
        email: 'vend@teste.com',
        client_id: clientId,
      },
      {
        client_id: clientId,
        name: 'Lead do Evento',
        phone: '11977777777',
        source: LeadSource.manual,
        event_interest_id: eventId,
      } as never,
    );

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          assigned_vendor_id: vendorId,
          registered_by_id: vendorId,
          event_interest_id: eventId,
          team_id: teamId,
        }),
      }),
    );
  });

  it('bloqueia atribuir lead para vendedor de outra empresa', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      id: 'lead-transfer',
      client_id: clientId,
      event_interest_id: eventId,
      assigned_vendor_id: null,
      team_id: null,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: vendorId,
      client_id: partnerClientId,
    });
    prisma.salesTeamMember.findFirst.mockResolvedValue({ team_id: teamId });

    await expect(
      service.update(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: 'Gestor',
          email: 'gestor@teste.com',
          client_id: null,
        },
        'lead-transfer',
        {
          assigned_vendor_id: vendorId,
          event_interest_id: eventId,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('bloqueia vendedor tentando importar para outro cliente', async () => {
    await expect(
      service.importCsv(
        {
          sub: 'vendor-1',
          role: Role.VENDEDOR,
          name: 'Vendedor',
          email: 'vend@teste.com',
          client_id: clientId,
        },
        { client_id: '33333333-3333-4333-8333-333333333333' },
        {
          buffer: Buffer.from('name\nLead', 'utf8'),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── createForIntegration — deduplicação ──────────────────────────────────

  const baseExistingLead = {
    id: 'lead-existente-1',
    client_id: clientId,
    name: 'Ana Silva',
    email: 'ana@example.com',
    phone: '11999999999',
    source: LeadSource.form_page,
    tags: [],
    crm_pipeline_id: null,
    crm_stage_id: null,
    crm_stage: null,
    crm_pipeline: null,
    event_interest: null,
    event_interest_id: null,
    confirmation_status: 'pending',
    confirmation_date: null,
    store_visit_datetime: null,
    team_id: null,
    assigned_vendor_id: null,
    campaign_id: null,
    notes: null,
    facebook_lead_id: null,
    checkin_token: null,
    created_at: new Date('2026-05-01T10:00:00.000Z'),
    updated_at: new Date('2026-05-01T10:00:00.000Z'),
    appointments: [],
    deleted_at: null,
  };

  it('createForIntegration: retorna lead existente com already_existed=true quando telefone coincide', async () => {
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    const result = await service.createForIntegration({
      client_id: clientId,
      name: 'Ana Silva',
      phone: '11999999999',
      source: LeadSource.form_page,
    } as any);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(result.already_existed).toBe(true);
    expect(result.id).toBe('lead-existente-1');
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client_id: clientId,
          deleted_at: null,
          OR: expect.arrayContaining([{ phone: '11999999999' }]),
        }),
      }),
    );
  });

  it('createForIntegration: retorna lead existente com already_existed=true quando e-mail coincide', async () => {
    prisma.lead.findFirst.mockResolvedValue(baseExistingLead);

    const result = await service.createForIntegration({
      client_id: clientId,
      name: 'Ana Silva',
      email: 'ANA@EXAMPLE.COM',
      source: LeadSource.form_page,
    } as any);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(result.already_existed).toBe(true);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ email: 'ana@example.com' }]),
        }),
      }),
    );
  });

  it('createForIntegration: cria novo lead com already_existed=false quando nao existe duplicata', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue({
      ...baseExistingLead,
      id: 'lead-novo-1',
    });

    const result = await service.createForIntegration({
      client_id: clientId,
      name: 'Bruno Costa',
      phone: '11988888888',
      email: 'bruno@example.com',
      source: LeadSource.form_page,
    } as any);

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          name: 'Bruno Costa',
          phone: '+5511988888888',
          email: 'bruno@example.com',
        }),
      }),
    );
    expect(result.already_existed).toBe(false);
    expect(result.id).toBe('lead-novo-1');
  });

  it('bloqueia update de lead quando telefone pertence a outro lead do mesmo cliente', async () => {
    prisma.lead.findFirst
      .mockResolvedValueOnce({
        ...baseExistingLead,
        id: 'lead-atual',
        phone: '11988888888',
      })
      .mockResolvedValueOnce(baseExistingLead);

    await expect(
      service.update(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: 'Gestor',
          email: 'gestor@teste.com',
          client_id: null,
        },
        'lead-atual',
        {
          phone: '11999999999',
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  // ─── create: validações de FK e dedup por e-mail ──────────────────────────

  it('bloqueia create quando crm_stage_id nao pertence ao cliente', async () => {
    prisma.crmStage.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { sub: gestorId, role: Role.GESTOR, name: 'G', email: 'g@x', client_id: null } as never,
        {
          client_id: clientId,
          name: 'Lead X',
          source: LeadSource.manual,
          crm_pipeline_id: '88888888-8888-4888-8888-888888888888',
          crm_stage_id: '99999999-9999-4999-8999-999999999999',
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.crmStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '99999999-9999-4999-8999-999999999999', client_id: clientId },
      }),
    );
  });

  it('bloqueia create quando event_interest_id nao pertence ao cliente', async () => {
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { sub: gestorId, role: Role.GESTOR, name: 'G', email: 'g@x', client_id: null } as never,
        {
          client_id: clientId,
          name: 'Lead Y',
          source: LeadSource.manual,
          event_interest_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          participants: {
            some: { client_id: clientId },
          },
        },
      }),
    );
  });

  it('bloqueia create quando e-mail ja esta cadastrado para o cliente', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce(baseExistingLead); // email check: duplicata encontrada

    await expect(
      service.create(
        { sub: gestorId, role: Role.GESTOR, name: 'G', email: 'g@x', client_id: null } as never,
        {
          client_id: clientId,
          name: 'Lead Dup Email',
          email: 'ANA@EXAMPLE.COM',
          source: LeadSource.manual,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('closeAttendance: vendedor encerra sem CPF/pulseira e move para ATENDIMENTO_ENCERRADO', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      crm_pipeline_id: 'pipeline-1',
      crm_stage_id: 'stage-old',
    });
    prisma.crmStage.findFirst.mockResolvedValueOnce({ id: 'stage-encerrado' });
    prisma.lead.update.mockResolvedValueOnce({
      ...baseExistingLead,
      confirmation_status: ConfirmationStatus.closed,
      crm_stage_id: 'stage-encerrado',
    });

    const result = await service.closeAttendance(
      { sub: vendorId, role: Role.VENDEDOR, name: 'V', email: 'v@x', client_id: clientId } as never,
      baseExistingLead.id,
      { sold: false },
    );

    expect(prisma.crmStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: expect.stringContaining('_ATENDIMENTO_ENCERRADO'),
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseExistingLead.id },
        data: expect.objectContaining({
          confirmation_status: ConfirmationStatus.closed,
          crm_stage_id: 'stage-encerrado',
        }),
      }),
    );
    const updateData = prisma.lead.update.mock.calls[0]?.[0]?.data;
    expect(updateData).not.toHaveProperty('wristband_number');
    expect(updateData).not.toHaveProperty('cpf');
    expect(updateData).not.toHaveProperty('phone');
    expect(prisma.crmHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lead_id: baseExistingLead.id,
          to_stage_id: 'stage-encerrado',
          notes: 'Atendimento encerrado sem venda',
        }),
      }),
    );
    expect(result.confirmation_status).toBe(ConfirmationStatus.closed);
  });

  it('closeAttendance: move para COMPRARAM quando o vendedor confirma a venda', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      crm_pipeline_id: 'pipeline-1',
      crm_stage_id: 'stage-old',
    });
    prisma.crmStage.findFirst.mockResolvedValueOnce({ id: 'stage-vendido' });
    prisma.lead.update.mockResolvedValueOnce({
      ...baseExistingLead,
      confirmation_status: ConfirmationStatus.closed,
      crm_stage_id: 'stage-vendido',
      sold_by_vendor_id: vendorId,
    });

    await service.closeAttendance(
      { sub: vendorId, role: Role.VENDEDOR, name: 'V', email: 'v@x', client_id: clientId } as never,
      baseExistingLead.id,
      { sold: true },
    );

    expect(prisma.crmStage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: expect.stringContaining('_COMPRARAM'),
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          crm_stage_id: 'stage-vendido',
          sold_by_vendor_id: vendorId,
        }),
      }),
    );
  });

  it('closeAttendance: mantém CPF obrigatório para perfis que fazem a baixa completa', async () => {
    await expect(
      service.closeAttendance(
        {
          sub: gestorId,
          role: Role.GESTOR,
          name: 'G',
          email: 'g@x',
          client_id: clientId,
        } as never,
        baseExistingLead.id,
        { sold: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
  });

  it('bloqueia check-in do vendedor quando o evento não permite', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({
      ...baseExistingLead,
      event_interest_id: eventId,
      checkin_token: 'convite-evento',
    });
    prisma.event.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.checkInByToken(
        {
          sub: vendorId,
          role: Role.VENDEDOR,
          name: 'V',
          email: 'v@x',
          client_id: clientId,
        } as never,
        'convite-evento',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('bloqueia consulta FIPE do vendedor quando o evento não permite', async () => {
    prisma.event.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getFipeDataPublic(
        'ABC1D23',
        {
          sub: vendorId,
          role: Role.VENDEDOR,
          name: 'V',
          email: 'v@x',
          client_id: clientId,
        } as never,
        eventId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

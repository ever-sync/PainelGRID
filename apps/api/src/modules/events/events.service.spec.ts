/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { Role } from '../../common/types';
import { EventsService } from './events.service';

describe('EventsService', () => {
  const clientId = '11111111-1111-4111-8111-111111111111';
  let prisma: any;
  let clientsService: any;
  let service: EventsService;

  const baseRow = {
    id: 'evt-1',
    client_id: clientId,
    participants: [{ client_id: clientId }],
    name: 'Workshop',
    event_type: null,
    description: null,
    launch_date: null,
    event_date: new Date(),
    event_end_date: null,
    location: null,
    capacity: null,
    allow_vendor_checkin: true,
    allow_vendor_fipe: true,
    status: EventStatus.active,
    cover_image_url: null,
    image_urls: [],
    created_at: new Date(),
    updated_at: new Date(),
    _count: { interested_leads: 4 },
    appointments: [{ status: 'confirmed' }, { status: 'completed' }],
  };

  const gestorUser = { sub: 'gestor-1', role: Role.GESTOR, email: 'g@x', name: 'G' } as never;

  beforeEach(() => {
    prisma = {
      client: {
        count: jest.fn(),
      },
      event: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      appointment: {
        deleteMany: jest.fn(),
      },
      lead: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    clientsService = {
      assertGestorOwnsClient: jest.fn(),
      findAllForUser: jest.fn(),
    };
    service = new EventsService(prisma, clientsService);
    prisma.client.count.mockResolvedValue(1);
    prisma.event.update.mockResolvedValue(baseRow);
  });

  describe('findAll', () => {
    it('GESTOR: valida ownership e aplica filtro de status quando informado', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.findMany.mockResolvedValue([baseRow]);

      const result = await service.findAll(gestorUser, {
        client_id: clientId,
        status: EventStatus.active,
      } as never);

      expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith('gestor-1', clientId);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: { some: { client_id: { in: [clientId] } } },
          },
        }),
      );
      expect(result[0]).toMatchObject({
        id: 'evt-1',
        leads_count: 4,
        confirmed_count: 2,
        checkin_count: 1,
        _count: { interested_leads: 4 },
      });
    });

    it('GESTOR: lista todos os eventos dos clientes vinculados quando client_id nao vem na query', async () => {
      clientsService.findAllForUser.mockResolvedValue([
        { id: clientId },
        { id: '22222222-2222-4222-8222-222222222222' },
      ]);
      prisma.event.findMany.mockResolvedValue([baseRow]);

      const result = await service.findAll(gestorUser, {} as never);

      expect(clientsService.findAllForUser).toHaveBeenCalledWith(gestorUser);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: {
              some: { client_id: { in: [clientId, '22222222-2222-4222-8222-222222222222'] } },
            },
          },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('CLIENTE: bloqueia client_id divergente', async () => {
      await expect(
        service.findAll(
          { sub: 'u', role: Role.CLIENTE, email: 'c@x', name: 'C', client_id: 'outro' } as never,
          { client_id: clientId } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('CLIENTE: usa o proprio client_id quando a query nao envia filtro', async () => {
      prisma.event.findMany.mockResolvedValue([baseRow]);

      const result = await service.findAll(
        {
          sub: 'c1',
          role: Role.CLIENTE,
          email: 'c@x',
          name: 'Cliente',
          client_id: clientId,
        } as never,
        {} as never,
      );

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: {
              some: { client_id: { in: [clientId] } },
            },
          },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('CLIENTE: lista também eventos compartilhados via participants', async () => {
      prisma.event.findMany.mockResolvedValue([
        {
          ...baseRow,
          client_id: 'outro-cliente',
          participants: [{ client_id: 'outro-cliente' }, { client_id: clientId }],
        },
      ]);

      const result = await service.findAll(
        {
          sub: 'c1',
          role: Role.CLIENTE,
          email: 'c@x',
          name: 'Cliente',
          client_id: clientId,
        } as never,
        { client_id: clientId } as never,
      );

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: { some: { client_id: { in: [clientId] } } },
          },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('retorna evento serializado com stats', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.findUnique.mockResolvedValue(baseRow);

      const result = await service.findOne(gestorUser, 'evt-1');

      expect(prisma.event.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'evt-1' } }),
      );
      expect(result).toMatchObject({ id: 'evt-1', confirmed_count: 2, checkin_count: 1 });
    });

    it('lanca NotFoundException quando evento nao existe', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne(gestorUser, 'inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('CLIENTE: bloqueia acesso a evento de outro client_id', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseRow,
        client_id: 'outro-cliente',
        participants: [{ client_id: 'outro-cliente' }],
      });

      await expect(
        service.findOne(
          { sub: 'u', role: Role.CLIENTE, email: 'c@x', name: 'C', client_id: clientId } as never,
          'evt-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('CLIENTE: permite acessar evento onde a empresa está convidada', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseRow,
        client_id: 'outro-cliente',
        participants: [{ client_id: 'outro-cliente' }, { client_id: clientId }],
      });

      const result = await service.findOne(
        { sub: 'u', role: Role.CLIENTE, email: 'c@x', name: 'C', client_id: clientId } as never,
        'evt-1',
      );

      expect(result.id).toBe('evt-1');
    });
  });

  describe('create', () => {
    it('cria evento com defaults para campos opcionais', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.create.mockResolvedValue({
        ...baseRow,
        id: 'new-evt',
        name: 'Lançamento',
        event_date: new Date('2026-07-01'),
        status: EventStatus.draft,
        _count: { interested_leads: 0 },
        appointments: [],
      });

      const result = await service.create(gestorUser, {
        participant_client_ids: [clientId],
        name: '  Lançamento  ',
        event_date: '2026-07-01T00:00:00.000Z',
      } as never);

      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            client_id: clientId,
            name: 'Lançamento',
            description: null,
            location: null,
            capacity: null,
            allow_vendor_checkin: true,
            allow_vendor_fipe: true,
            status: EventStatus.draft,
          }),
        }),
      );
      expect(result.name).toBe('Lançamento');
    });

    it('VENDEDOR sem client_id: bloqueia create', async () => {
      await expect(
        service.create(
          { sub: 'v', role: Role.VENDEDOR, email: 'v@x', name: 'V', client_id: null } as never,
          { client_id: clientId, name: 'X', event_date: '2026-01-01' } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('atualiza campos e retorna evento serializado', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.findUnique.mockResolvedValue({
        ...baseRow,
        name: 'Original',
        appointments: [{ status: 'confirmed' }],
      });
      prisma.event.update.mockResolvedValue({
        ...baseRow,
        name: 'Novo nome',
        description: 'Nova desc',
        location: 'Novo local',
        capacity: 120,
        allow_vendor_checkin: false,
        allow_vendor_fipe: false,
        status: EventStatus.active,
        cover_image_url: 'https://img.test/cover.png',
        _count: { interested_leads: 7 },
        appointments: [{ status: 'confirmed' }, { status: 'completed' }],
      });

      const result = await service.update(gestorUser, 'evt-1', {
        name: '  Novo nome  ',
        description: '  Nova desc  ',
        event_date: '2026-07-02T10:00:00.000Z',
        location: '  Novo local  ',
        capacity: 120,
        allow_vendor_checkin: false,
        allow_vendor_fipe: false,
        status: EventStatus.active,
        cover_image_url: 'https://img.test/cover.png',
      } as never);

      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1' },
          data: expect.objectContaining({
            name: 'Novo nome',
            description: 'Nova desc',
            location: 'Novo local',
            capacity: 120,
            allow_vendor_checkin: false,
            allow_vendor_fipe: false,
            status: EventStatus.active,
            cover_image_url: 'https://img.test/cover.png',
          }),
        }),
      );
      expect(result.confirmed_count).toBe(2);
      expect(result.checkin_count).toBe(1);
    });

    it('persiste a limpeza dos campos opcionais do formulario', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.findUnique.mockResolvedValue({
        ...baseRow,
        event_type: 'Feirao',
        description: 'Descricao anterior',
        launch_date: new Date('2026-07-01'),
        event_end_date: new Date('2026-07-03'),
        location: 'Local anterior',
        capacity: 100,
      });

      await service.update(gestorUser, 'evt-1', {
        event_type: null,
        description: null,
        launch_date: null,
        event_end_date: null,
        location: null,
        capacity: null,
      });

      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event_type: null,
            description: null,
            launch_date: null,
            event_end_date: null,
            location: null,
            capacity: null,
          }),
        }),
      );
    });

    it('valida ownership pelo client_id do evento existente, nao do DTO', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...baseRow, client_id: 'cliente-alheio' });
      clientsService.assertGestorOwnsClient.mockRejectedValue(new ForbiddenException());

      await expect(
        service.update(gestorUser, 'evt-1', { name: 'hack' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith('gestor-1', clientId);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('lanca NotFoundException quando evento nao existe', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.update(gestorUser, 'nope', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('bloqueia cliente tentando alterar permissões dos vendedores', async () => {
      await expect(
        service.update(
          {
            sub: 'cliente-user',
            role: Role.CLIENTE,
            email: 'c@x',
            name: 'C',
            client_id: clientId,
          } as never,
          'evt-1',
          { allow_vendor_checkin: false } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.event.findUnique).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('exclui evento sem leads nem agendamentos', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.findUnique.mockResolvedValue({
        ...baseRow,
        _count: { interested_leads: 0, appointments: 0 },
      });
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback({
          appointment: prisma.appointment,
          lead: prisma.lead,
          event: prisma.event,
        }),
      );
      prisma.event.delete.mockResolvedValue({ id: 'evt-1' });

      const result = await service.remove(gestorUser, 'evt-1');

      expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({
        where: { event_id: 'evt-1' },
      });
      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { event_interest_id: 'evt-1' },
        data: { event_interest_id: null },
      });
      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
      expect(result).toEqual({ id: 'evt-1' });
    });

    it('remove registros dependentes quando o evento possui agendamentos', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.findUnique.mockResolvedValue({
        ...baseRow,
        _count: { interested_leads: 0, appointments: 3 },
      });
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback({
          appointment: prisma.appointment,
          lead: prisma.lead,
          event: prisma.event,
        }),
      );
      prisma.event.delete.mockResolvedValue({ id: 'evt-1' });

      const result = await service.remove(gestorUser, 'evt-1');

      expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({
        where: { event_id: 'evt-1' },
      });
      expect(result).toEqual({ id: 'evt-1' });
    });

    it('remove registros dependentes quando o evento possui leads interessados', async () => {
      clientsService.assertGestorOwnsClient.mockResolvedValue({ id: clientId });
      prisma.event.findUnique.mockResolvedValue({
        ...baseRow,
        _count: { interested_leads: 5, appointments: 0 },
      });
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback({
          appointment: prisma.appointment,
          lead: prisma.lead,
          event: prisma.event,
        }),
      );
      prisma.event.delete.mockResolvedValue({ id: 'evt-1' });

      const result = await service.remove(gestorUser, 'evt-1');

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { event_interest_id: 'evt-1' },
        data: { event_interest_id: null },
      });
      expect(result).toEqual({ id: 'evt-1' });
    });

    it('lanca NotFoundException quando evento nao existe', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.remove(gestorUser, 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

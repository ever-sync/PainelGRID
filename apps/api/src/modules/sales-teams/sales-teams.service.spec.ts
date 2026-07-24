/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/types';
import { SalesTeamsService } from './sales-teams.service';

describe('SalesTeamsService', () => {
  const clientId = '11111111-1111-4111-8111-111111111111';
  const otherClientId = '22222222-2222-4222-8222-222222222222';
  const eventId = '33333333-3333-4333-8333-333333333333';
  const teamId = '44444444-4444-4444-8444-444444444444';
  const vendorId = '55555555-5555-4555-8555-555555555555';

  let prisma: any;
  let service: SalesTeamsService;

  const gestorUser = { sub: 'gestor-1', role: Role.GESTOR, email: 'g@x', name: 'G' } as never;
  const clienteUser = {
    sub: 'cliente-1',
    role: Role.CLIENTE,
    email: 'c@x',
    name: 'C',
    client_id: clientId,
  } as never;

  beforeEach(() => {
    prisma = {
      client: {
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      event: {
        findUnique: jest.fn(),
      },
      eventParticipant: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      salesTeam: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      salesTeamMember: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      lead: {
        groupBy: jest.fn(),
      },
      scoreEvent: {
        findMany: jest.fn(),
      },
    };

    service = new SalesTeamsService(prisma);
  });

  it('lista times pelo evento e valida acesso do cliente dono', async () => {
    prisma.client.count.mockResolvedValue(2);
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: clientId,
      participants: [{ client_id: clientId }],
    });
    prisma.salesTeam.findMany.mockResolvedValue([]);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.scoreEvent.findMany.mockResolvedValue([]);

    await service.findAll(gestorUser, eventId);

    expect(prisma.event.findUnique).toHaveBeenCalledWith({
      where: { id: eventId },
      select: { id: true, client_id: true, participants: { select: { client_id: true } } },
    });
    expect(prisma.salesTeam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { event_id: eventId } }),
    );
  });

  it('cria time dentro do evento', async () => {
    prisma.client.count.mockResolvedValue(1);
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: clientId,
      participants: [{ client_id: clientId }],
    });
    prisma.salesTeam.create.mockResolvedValue({
      id: teamId,
      client_id: clientId,
      event_id: eventId,
      name: 'Time Expo',
      created_at: new Date(),
      updated_at: new Date(),
      members: [],
    });

    const result = await service.create(gestorUser, eventId, undefined, {
      name: ' Time Expo ',
    } as never);

    expect(prisma.salesTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          event_id: eventId,
          name: 'Time Expo',
        }),
      }),
    );
    expect(result.event_id).toBe(eventId);
  });

  it('permite adicionar vendedor de outro cliente ao time do evento', async () => {
    prisma.client.count.mockResolvedValue(2);
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: clientId,
      participants: [{ client_id: clientId }, { client_id: otherClientId }],
    });
    prisma.salesTeam.findUnique.mockResolvedValue({
      id: teamId,
      client_id: clientId,
      event_id: eventId,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: vendorId,
      role: 'vendedor',
      client_id: otherClientId,
      name: 'Vendedor',
    });
    prisma.eventParticipant.findFirst.mockResolvedValue({ id: 'ep-1' });
    prisma.salesTeamMember.findFirst.mockResolvedValue(null);
    prisma.salesTeamMember.upsert.mockResolvedValue({});
    prisma.salesTeam.findUnique.mockResolvedValueOnce({
      id: teamId,
      client_id: clientId,
      event_id: eventId,
    });
    prisma.salesTeam.findUnique.mockResolvedValueOnce({
      id: teamId,
      client_id: clientId,
      event_id: eventId,
      members: [],
    });

    const result = await service.addMember(gestorUser, teamId, { user_id: vendorId } as never);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: vendorId } });
    expect(prisma.salesTeamMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { team_id: teamId, user_id: vendorId },
      }),
    );
    expect(result).toBeDefined();
  });

  it('bloqueia vendedor já alocado em outro time do mesmo evento', async () => {
    prisma.client.count.mockResolvedValue(2);
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: clientId,
      participants: [{ client_id: clientId }, { client_id: otherClientId }],
    });
    prisma.salesTeam.findUnique.mockResolvedValue({
      id: teamId,
      client_id: clientId,
      event_id: eventId,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: vendorId,
      role: 'vendedor',
      client_id: otherClientId,
      name: 'Vendedor',
    });
    prisma.eventParticipant.findFirst.mockResolvedValue({ id: 'ep-1' });
    prisma.salesTeamMember.findFirst.mockResolvedValue({ team_id: 'outro-time' });

    await expect(
      service.addMember(gestorUser, teamId, { user_id: vendorId } as never),
    ).rejects.toThrow('Este vendedor já está em outro time deste evento');

    expect(prisma.salesTeamMember.upsert).not.toHaveBeenCalled();
  });

  it('bloqueia criação sem event_id', async () => {
    await expect(
      service.create(gestorUser, undefined, undefined, { name: 'X' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia acesso a evento de outro cliente', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: otherClientId,
      participants: [{ client_id: otherClientId }],
    });

    await expect(service.findAll(clienteUser, eventId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lança NotFoundException quando o time não existe', async () => {
    prisma.salesTeam.findUnique.mockResolvedValue(null);

    await expect(service.remove(gestorUser, teamId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('permite cliente participante ler times do evento compartilhado', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: eventId,
      client_id: otherClientId,
      participants: [{ client_id: otherClientId }, { client_id: clientId }],
    });
    prisma.salesTeam.findMany.mockResolvedValue([]);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.scoreEvent.findMany.mockResolvedValue([]);

    await service.findAll(clienteUser, eventId);

    expect(prisma.salesTeam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { event_id: eventId } }),
    );
  });
});

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../../common/types';
import { CreateRubinhoDto } from './dto/create-rubinho.dto';
import { UpdateRubinhoDto } from './dto/update-rubinho.dto';
import { CreateFaqDto } from './dto/create-faq.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class RubinhoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  private async assertGestorClientAccess(user: AuthenticatedUser, clientId: string) {
    if (user.role === Role.GESTOR) {
      await this.clientsService.assertGestorOwnsClient(user.sub, clientId);
      return;
    }
    if (user.role === Role.CLIENTE) {
      if (user.client_id !== clientId) {
        throw new ForbiddenException('Sem permissão para este cliente');
      }
      return;
    }
    throw new ForbiddenException(
      'Apenas gestores e clientes possuem acesso administrativo ao Rubinho',
    );
  }

  async create(user: AuthenticatedUser, dto: CreateRubinhoDto) {
    await this.assertGestorClientAccess(user, dto.client_id);

    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.rubinhoAgent.create({
        data: {
          client_id: dto.client_id,
          name: dto.name,
          status: dto.status !== undefined ? dto.status : true,
          prompt: dto.prompt,
          tone: dto.tone || 'Amigável',
          delay_minutes: dto.delay_minutes !== undefined ? dto.delay_minutes : 5,
        },
      });

      if (dto.event_ids && dto.event_ids.length > 0) {
        // Validate events belong to the client
        const validEvents = await tx.event.findMany({
          where: {
            id: { in: dto.event_ids },
            client_id: dto.client_id,
          },
          select: { id: true },
        });

        const validEventIds = validEvents.map((e) => e.id);
        if (validEventIds.length > 0) {
          await tx.rubinhoAgentEvent.createMany({
            data: validEventIds.map((eventId) => ({
              rubinho_agent_id: agent.id,
              event_id: eventId,
            })),
          });
        }
      }

      return tx.rubinhoAgent.findUnique({
        where: { id: agent.id },
        include: {
          events: {
            include: { event: { select: { id: true, name: true } } },
          },
        },
      });
    });
  }

  async findAll(user: AuthenticatedUser, clientId: string) {
    await this.assertGestorClientAccess(user, clientId);

    return this.prisma.rubinhoAgent.findMany({
      where: { client_id: clientId },
      orderBy: { created_at: 'desc' },
      include: {
        events: {
          include: { event: { select: { id: true, name: true } } },
        },
        _count: {
          select: { faqs: true, documents: true },
        },
      },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const agent = await this.prisma.rubinhoAgent.findUnique({
      where: { id },
      include: {
        events: {
          include: { event: { select: { id: true, name: true } } },
        },
        faqs: {
          orderBy: { created_at: 'asc' },
        },
        documents: {
          orderBy: { title: 'asc' },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agente Rubinho não encontrado');
    }

    await this.assertGestorClientAccess(user, agent.client_id);
    return agent;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateRubinhoDto) {
    const agent = await this.prisma.rubinhoAgent.findUnique({
      where: { id },
      select: { client_id: true },
    });

    if (!agent) {
      throw new NotFoundException('Agente Rubinho não encontrado');
    }

    await this.assertGestorClientAccess(user, agent.client_id);

    return this.prisma.$transaction(async (tx) => {
      await tx.rubinhoAgent.update({
        where: { id },
        data: {
          name: dto.name,
          status: dto.status,
          prompt: dto.prompt,
          tone: dto.tone,
          delay_minutes: dto.delay_minutes,
        },
      });

      if (dto.event_ids !== undefined) {
        // Remove existing associations
        await tx.rubinhoAgentEvent.deleteMany({
          where: { rubinho_agent_id: id },
        });

        if (dto.event_ids.length > 0) {
          // Validate events belong to the client
          const validEvents = await tx.event.findMany({
            where: {
              id: { in: dto.event_ids },
              client_id: agent.client_id,
            },
            select: { id: true },
          });

          const validEventIds = validEvents.map((e) => e.id);
          if (validEventIds.length > 0) {
            await tx.rubinhoAgentEvent.createMany({
              data: validEventIds.map((eventId) => ({
                rubinho_agent_id: id,
                event_id: eventId,
              })),
            });
          }
        }
      }

      return tx.rubinhoAgent.findUnique({
        where: { id },
        include: {
          events: {
            include: { event: { select: { id: true, name: true } } },
          },
        },
      });
    });
  }

  async delete(user: AuthenticatedUser, id: string) {
    const agent = await this.prisma.rubinhoAgent.findUnique({
      where: { id },
      select: { client_id: true },
    });

    if (!agent) {
      throw new NotFoundException('Agente Rubinho não encontrado');
    }

    await this.assertGestorClientAccess(user, agent.client_id);

    await this.prisma.rubinhoAgent.delete({
      where: { id },
    });

    return { success: true };
  }

  // FAQs CRUD
  async addFaq(user: AuthenticatedUser, agentId: string, dto: CreateFaqDto) {
    const agent = await this.prisma.rubinhoAgent.findUnique({
      where: { id: agentId },
      select: { client_id: true },
    });

    if (!agent) {
      throw new NotFoundException('Agente Rubinho não encontrado');
    }

    await this.assertGestorClientAccess(user, agent.client_id);

    return this.prisma.rubinhoAgentFaq.create({
      data: {
        rubinho_agent_id: agentId,
        question: dto.question,
        answer: dto.answer,
      },
    });
  }

  async updateFaq(user: AuthenticatedUser, faqId: string, dto: CreateFaqDto) {
    const faq = await this.prisma.rubinhoAgentFaq.findUnique({
      where: { id: faqId },
      include: { rubinho_agent: { select: { client_id: true } } },
    });

    if (!faq) {
      throw new NotFoundException('FAQ não encontrado');
    }

    await this.assertGestorClientAccess(user, faq.rubinho_agent.client_id);

    return this.prisma.rubinhoAgentFaq.update({
      where: { id: faqId },
      data: {
        question: dto.question,
        answer: dto.answer,
      },
    });
  }

  async deleteFaq(user: AuthenticatedUser, faqId: string) {
    const faq = await this.prisma.rubinhoAgentFaq.findUnique({
      where: { id: faqId },
      include: { rubinho_agent: { select: { client_id: true } } },
    });

    if (!faq) {
      throw new NotFoundException('FAQ não encontrado');
    }

    await this.assertGestorClientAccess(user, faq.rubinho_agent.client_id);

    await this.prisma.rubinhoAgentFaq.delete({
      where: { id: faqId },
    });

    return { success: true };
  }

  // Documents CRUD
  async addDocument(user: AuthenticatedUser, agentId: string, dto: CreateDocumentDto) {
    const agent = await this.prisma.rubinhoAgent.findUnique({
      where: { id: agentId },
      select: { client_id: true },
    });

    if (!agent) {
      throw new NotFoundException('Agente Rubinho não encontrado');
    }

    await this.assertGestorClientAccess(user, agent.client_id);

    return this.prisma.rubinhoAgentDocument.create({
      data: {
        rubinho_agent_id: agentId,
        title: dto.title,
        content: dto.content,
      },
    });
  }

  async updateDocument(user: AuthenticatedUser, docId: string, dto: CreateDocumentDto) {
    const doc = await this.prisma.rubinhoAgentDocument.findUnique({
      where: { id: docId },
      include: { rubinho_agent: { select: { client_id: true } } },
    });

    if (!doc) {
      throw new NotFoundException('Documento não encontrado');
    }

    await this.assertGestorClientAccess(user, doc.rubinho_agent.client_id);

    return this.prisma.rubinhoAgentDocument.update({
      where: { id: docId },
      data: {
        title: dto.title,
        content: dto.content,
      },
    });
  }

  async deleteDocument(user: AuthenticatedUser, docId: string) {
    const doc = await this.prisma.rubinhoAgentDocument.findUnique({
      where: { id: docId },
      include: { rubinho_agent: { select: { client_id: true } } },
    });

    if (!doc) {
      throw new NotFoundException('Documento não encontrado');
    }

    await this.assertGestorClientAccess(user, doc.rubinho_agent.client_id);

    await this.prisma.rubinhoAgentDocument.delete({
      where: { id: docId },
    });

    return { success: true };
  }

  // Integration for n8n
  async getRubinhoConfigForIntegration(
    eventId?: string,
    leadId?: string,
    includeKnowledge = false,
  ) {
    let resolvedEventId = eventId;

    if (!resolvedEventId && leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { event_interest_id: true },
      });
      if (lead?.event_interest_id) {
        resolvedEventId = lead.event_interest_id;
      }
    }

    if (!resolvedEventId) {
      throw new BadRequestException(
        'É necessário informar event_id ou um lead_id com evento de interesse vinculado',
      );
    }

    // Find the active Rubinho agent linked to this event
    const association = includeKnowledge
      ? await this.prisma.rubinhoAgentEvent.findFirst({
          where: {
            event_id: resolvedEventId,
            rubinho_agent: { status: true },
          },
          include: {
            rubinho_agent: {
              include: {
                faqs: {
                  select: { question: true, answer: true },
                  orderBy: { created_at: 'asc' },
                },
                documents: {
                  select: { title: true, content: true },
                  orderBy: { created_at: 'asc' },
                },
              },
            },
          },
        })
      : await this.prisma.rubinhoAgentEvent.findFirst({
          where: {
            event_id: resolvedEventId,
            rubinho_agent: { status: true },
          },
          include: { rubinho_agent: true },
        });

    if (!association?.rubinho_agent) {
      throw new NotFoundException(
        `Nenhum agente Rubinho ativo encontrado para o evento ${resolvedEventId}`,
      );
    }

    const agent = association.rubinho_agent;

    const event = await this.prisma.event.findUnique({
      where: { id: resolvedEventId },
      select: { client_id: true },
    });

    const vehicles =
      includeKnowledge && event?.client_id
        ? await this.prisma.vehicle.findMany({
            where: {
              client_id: event.client_id,
              status: true,
            },
            select: {
              brand: true,
              model: true,
              year_or_km: true,
              price: true,
              stores: true,
              tags: true,
              image_url: true,
              category: true,
              gallery: true,
              condition: true,
              manufacturing_year: true,
              model_year: true,
              km: true,
            },
            orderBy: { created_at: 'desc' },
          })
        : undefined;

    return {
      agent_id: agent.id,
      event_id: resolvedEventId,
      name: agent.name,
      status: agent.status,
      tone: agent.tone,
      delay_minutes: agent.delay_minutes,
      system_prompt: agent.prompt,
      faq: 'faqs' in agent ? agent.faqs : undefined,
      documents: 'documents' in agent ? agent.documents : undefined,
      vehicles,
    };
  }
}

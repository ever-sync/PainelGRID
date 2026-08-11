import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { SenderType } from "@prisma/client";
import { Role } from "../../common/types";
import { ConversationsService } from "./conversations.service";

const clientId = "11111111-1111-4111-8111-111111111111";
const convId = "cccc0000-0000-4000-8000-000000000001";
const leadId = "aaaa0000-0000-4000-8000-000000000001";

const makeConv = (channel = "whatsapp") => ({
  id: convId,
  client_id: clientId,
  lead_id: leadId,
  channel,
  last_message_at: new Date(),
  created_at: new Date(),
  lead: { assigned_vendor_id: "v1" },
});

const makeMsg = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "msg-1",
  conversation_id: convId,
  sender_type: SenderType.lead,
  sender_id: null,
  content: "oi",
  external_id: null,
  media_id: null,
  media_url: null,
  created_at: new Date(),
  ...overrides,
});

describe("ConversationsService", () => {
  let prisma: any;
  let clientsService: any;
  let realtimeEvents: any;
  let metaService: any;
  let service: ConversationsService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
      conversation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      message: {
        createMany: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      lead: { findUnique: jest.fn() },
      agentActionLog: { findMany: jest.fn() },
      conversationState: {
        upsert: jest.fn().mockResolvedValue({ updated_at: new Date() }),
      },
    };
    clientsService = {
      assertGestorOwnsClient: jest.fn().mockResolvedValue(undefined),
    };
    realtimeEvents = { emitNewMessage: jest.fn() };
    metaService = {
      sendClientWhatsappMessage: jest.fn().mockResolvedValue("wamid-1"),
    };
    prisma.$transaction.mockImplementation((callback: (tx: any) => unknown) =>
      callback(prisma),
    );
    service = new ConversationsService(
      prisma,
      clientsService,
      realtimeEvents,
      metaService,
      { dispatch: jest.fn() } as never,
      {
        upload: jest.fn(),
        download: jest.fn().mockResolvedValue(null),
      } as never,
      { upsert: jest.fn().mockResolvedValue({ id: "dispatch-1" }) } as never,
    );
  });

  describe("syncN8nHistoryForClient", () => {
    it("importa apenas mensagens humanas e respostas finais com IDs idempotentes", async () => {
      prisma.$queryRaw = jest.fn().mockResolvedValue([
        {
          history_id: 10,
          client_id: clientId,
          lead_id: leadId,
          message_type: "human",
          content: "Oi",
        },
        {
          history_id: 11,
          client_id: clientId,
          lead_id: leadId,
          message_type: "ai",
          content: "Ola!",
        },
      ]);
      prisma.conversation.findFirst.mockResolvedValue({
        ...makeConv(),
        last_message_at: null,
      });
      prisma.message.createMany.mockResolvedValue({ count: 2 });
      prisma.conversation.update.mockResolvedValue({});

      await expect(service.syncN8nHistoryForClient(clientId)).resolves.toBe(2);
      expect(prisma.message.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
          data: [
            expect.objectContaining({
              sender_type: SenderType.lead,
              external_id: "n8n-history:10",
              author_type: "lead",
              origin: "n8n",
            }),
            expect.objectContaining({
              sender_type: SenderType.user,
              external_id: "n8n-history:11",
              author_type: "rubinho",
              origin: "n8n",
              workflow_key: "n8n-agent-history",
            }),
          ],
        }),
      );
    });

    it("nao derruba a listagem quando a tabela historica nao existe", async () => {
      prisma.$queryRaw = jest
        .fn()
        .mockRejectedValue({ code: "P2010", meta: { code: "42P01" } });
      await expect(service.syncN8nHistoryForClient(clientId)).resolves.toBe(0);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe("findAll", () => {
    const baseRow = {
      id: convId,
      client_id: clientId,
      lead_id: leadId,
      channel: "whatsapp",
      last_message_at: new Date(),
      created_at: new Date(),
      lead: { id: leadId, name: "Maria" },
      state: {
        handoff_required: true,
        handoff_reason: "urgente",
        last_agent_action: "wait",
        updated_at: new Date(),
      },
      messages: [{ content: "ola" }],
    };

    it("GESTOR: delega ownership a clientsService e mapeia resposta", async () => {
      prisma.conversation.findMany.mockResolvedValue([baseRow]);

      const result = await service.findAll(
        { sub: "g1", role: Role.GESTOR, email: "g@x", name: "G" } as any,
        { client_id: clientId } as any,
      );

      expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith(
        "g1",
        clientId,
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: convId,
        lead_name: "Maria",
        last_message: "ola",
        handoff_required: true,
        handoff_reason: "urgente",
      });
    });

    it("GESTOR: lista todas as empresas quando client_id nao e informado", async () => {
      prisma.conversation.findMany.mockResolvedValue([baseRow]);

      const result = await service.findAll(
        { sub: "g1", role: Role.GESTOR, email: "g@x", name: "G" } as any,
        {} as any,
      );

      expect(clientsService.assertGestorOwnsClient).not.toHaveBeenCalled();
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { lead: { deleted_at: null } } }),
      );
      expect(result).toHaveLength(1);
    });

    it("usa a empresa do token quando outro perfil omite client_id", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.findAll(
        {
          sub: "r1",
          role: Role.RECEPCAO,
          email: "r@x",
          name: "R",
          client_id: clientId,
        } as any,
        {} as any,
      );

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { client_id: clientId, lead: { deleted_at: null } },
        }),
      );
    });

    it("nao lista conversa de lead excluido", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.findAll(
        { sub: "g1", role: Role.GESTOR, email: "g@x", name: "G" } as any,
        { client_id: clientId } as any,
      );

      const call = prisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.lead).toEqual({ deleted_at: null });
      // NULL por ultimo: conversa sem mensagem nao pode furar a fila no topo.
      // O `id` desempata para a paginacao nao repetir nem pular linhas.
      expect(call.orderBy).toEqual([
        { last_message_at: { sort: "desc", nulls: "last" } },
        { id: "desc" },
      ]);
    });

    it("pagina a lista e aceita busca por nome ou telefone", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.findAll(
        { sub: "g1", role: Role.GESTOR, email: "g@x", name: "G" } as any,
        { client_id: clientId, q: " Samuel ", take: 25, skip: 50 } as any,
      );

      const call = prisma.conversation.findMany.mock.calls[0][0];
      expect(call.take).toBe(25);
      expect(call.skip).toBe(50);
      expect(call.where.lead.OR).toEqual([
        { name: { contains: "Samuel", mode: "insensitive" } },
        { phone: { contains: "Samuel", mode: "insensitive" } },
      ]);
    });

    it("aplica um teto de pagina quando o cliente nao pede tamanho", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.findAll(
        { sub: "g1", role: Role.GESTOR, email: "g@x", name: "G" } as any,
        { client_id: clientId } as any,
      );

      const call = prisma.conversation.findMany.mock.calls[0][0];
      expect(call.take).toBe(100);
      expect(call.skip).toBe(0);
      expect(call.where.lead.OR).toBeUndefined();
    });

    it("VENDEDOR: passa quando client_id coincide", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await expect(
        service.findAll(
          {
            sub: "v1",
            role: Role.VENDEDOR,
            email: "v@x",
            name: "V",
            client_id: clientId,
          } as any,
          { client_id: clientId } as any,
        ),
      ).resolves.toEqual([]);
      expect(clientsService.assertGestorOwnsClient).not.toHaveBeenCalled();
    });

    it("VENDEDOR: bloqueia quando client_id difere", async () => {
      await expect(
        service.findAll(
          {
            sub: "v1",
            role: Role.VENDEDOR,
            email: "v@x",
            name: "V",
            client_id: "outro",
          } as any,
          { client_id: clientId } as any,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("CLIENTE: bloqueia a consulta de conversas de outra empresa", async () => {
      await expect(
        service.findAll(
          {
            sub: "c1",
            role: Role.CLIENTE,
            email: "cliente@x",
            name: "Cliente",
            client_id: "outro-cliente",
          } as any,
          { client_id: clientId } as any,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    });

    it("usa string vazia como last_message quando sem mensagens", async () => {
      prisma.conversation.findMany.mockResolvedValue([
        { ...baseRow, messages: [], state: null },
      ]);
      const result = await service.findAll(
        { sub: "g1", role: Role.GESTOR, email: "g@x", name: "G" } as any,
        { client_id: clientId } as any,
      );
      expect(result[0].last_message).toBe("");
      expect(result[0].handoff_required).toBe(false);
    });
  });

  // ─── findMessages ─────────────────────────────────────────────────────────

  describe("findMessages", () => {
    it("lança NotFoundException quando conversa nao existe", async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.findMessages(
          { sub: "u", role: Role.GESTOR } as any,
          "nao-existe",
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("RECEPCAO: bloqueia client_id divergente", async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv());
      await expect(
        service.findMessages(
          { sub: "r1", role: Role.RECEPCAO, client_id: "outro" } as any,
          convId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("VENDEDOR: bloqueia conversa atribuida a outro vendedor", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...makeConv(),
        lead: { assigned_vendor_id: "outro-vendedor" },
      });

      await expect(
        service.findMessages(
          { sub: "v1", role: Role.VENDEDOR, client_id: clientId } as any,
          convId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it("retorna mensagens quando autorizado", async () => {
      const msgs = [makeMsg({ id: "msg-1" }), makeMsg({ id: "msg-2" })];
      prisma.conversation.findUnique.mockResolvedValue(makeConv());
      prisma.message.findMany.mockResolvedValue(msgs);

      const result = await service.findMessages(
        { sub: "g1", role: Role.GESTOR } as any,
        convId,
      );

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversation_id: convId } }),
      );
      expect(result).toHaveLength(2);
    });
  });

  // ─── findAgentActions ────────────────────────────────────────────────────

  describe("findAgentActions", () => {
    it("lança NotFoundException quando conversa nao existe", async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.findAgentActions({ sub: "u", role: Role.GESTOR } as any, "x"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("retorna logs mapeados", async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv());
      prisma.agentActionLog.findMany.mockResolvedValue([
        {
          id: "log-1",
          conversation_id: convId,
          provider: "openai",
          model: "gpt-4",
          trigger_type: "message",
          decision_type: "reply",
          confidence: 0.9,
          input_summary: "in",
          output_summary: "out",
          action_payload: {},
          result_status: "success",
          error_message: null,
          created_at: new Date(),
        },
      ]);

      const result = await service.findAgentActions(
        { sub: "g1", role: Role.GESTOR } as any,
        convId,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: "log-1", provider: "openai" });
    });
  });

  // ─── addMessage ───────────────────────────────────────────────────────────

  describe("addMessage", () => {
    it("lança NotFoundException quando conversa nao existe", async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.addMessage({ sub: "u", role: Role.GESTOR } as any, convId, {
          content: "oi",
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("RECEPCAO → sender_type=system, nao chama metaService", async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv("whatsapp"));
      prisma.message.create.mockResolvedValue(
        makeMsg({ sender_type: SenderType.system }),
      );
      prisma.conversation.update.mockResolvedValue({});

      await service.addMessage(
        { sub: "r1", role: Role.RECEPCAO, client_id: clientId } as any,
        convId,
        { content: " oi " } as any,
      );

      expect(metaService.sendClientWhatsappMessage).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sender_type: SenderType.system,
            content: "oi",
          }),
        }),
      );
    });

    it("GESTOR + whatsapp → sender_type=user, chama metaService e emite realtime", async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv("whatsapp"));
      prisma.lead.findUnique.mockResolvedValue({ phone: "+5511999990000" });
      const created = makeMsg({ sender_type: SenderType.user, content: "ola" });
      prisma.message.create.mockResolvedValue(created);
      prisma.conversation.update.mockResolvedValue({});

      await service.addMessage(
        { sub: "g1", role: Role.GESTOR } as any,
        convId,
        {
          content: "ola",
        } as any,
      );

      expect(metaService.sendClientWhatsappMessage).toHaveBeenCalledWith(
        clientId,
        "+5511999990000",
        "ola",
      );
      expect(realtimeEvents.emitNewMessage).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({ conversation_id: convId }),
      );
    });

    it("ignora sender_id fornecido e registra o usuario autenticado", async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv("web"));
      prisma.message.create.mockResolvedValue(
        makeMsg({ sender_type: SenderType.user, sender_id: "g1" }),
      );
      prisma.conversation.update.mockResolvedValue({});

      await service.addMessage(
        { sub: "g1", role: Role.GESTOR } as any,
        convId,
        { content: "ola", sender_id: "usuario-forjado" } as any,
      );

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sender_id: "g1" }),
        }),
      );
    });

    it("canal nao-whatsapp → nao chama metaService", async () => {
      prisma.conversation.findUnique.mockResolvedValue(makeConv("web"));
      prisma.message.create.mockResolvedValue(
        makeMsg({ sender_type: SenderType.user }),
      );
      prisma.conversation.update.mockResolvedValue({});

      await service.addMessage(
        { sub: "v1", role: Role.VENDEDOR, client_id: clientId } as any,
        convId,
        { content: "msg" } as any,
      );

      expect(metaService.sendClientWhatsappMessage).not.toHaveBeenCalled();
    });

    it("findAll: vendedor visualiza apenas conversas dos seus proprios leads", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await service.findAll(
        { sub: "vendor-123", role: Role.VENDEDOR, client_id: clientId } as any,
        { client_id: clientId },
      );
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            client_id: clientId,
            lead: { assigned_vendor_id: "vendor-123", deleted_at: null },
          }),
        }),
      );
    });
  });
});

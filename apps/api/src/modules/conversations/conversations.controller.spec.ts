import { ConversationsController } from "./conversations.controller";

describe("ConversationsController", () => {
  const service = {
    findAll: jest.fn(),
    findMessages: jest.fn(),
    findAgentActions: jest.fn(),
    addMessage: jest.fn(),
  };

  const controller = new ConversationsController(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates findAll", async () => {
    service.findAll.mockResolvedValue([{ id: "conversation-1" }]);
    const user = {
      sub: "user-1",
      role: "gestor",
      email: "g@teste.com",
      name: "Gestor",
    };
    const query = { client_id: "client-1" };

    const result = await controller.findAll(query, user as never);

    expect(service.findAll).toHaveBeenCalledWith(user, query);
    expect(result).toEqual([{ id: "conversation-1" }]);
  });

  it("delegates messages", async () => {
    service.findMessages.mockResolvedValue([{ id: "msg-1" }]);
    const user = {
      sub: "user-1",
      role: "gestor",
      email: "g@teste.com",
      name: "Gestor",
    };

    const result = await controller.messages("conv-1", user as never);

    expect(service.findMessages).toHaveBeenCalledWith(user, "conv-1");
    expect(result).toEqual([{ id: "msg-1" }]);
  });
});

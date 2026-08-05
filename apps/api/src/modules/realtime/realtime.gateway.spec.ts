import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Socket } from "socket.io";
import { Role } from "../../common/types";
import { ClientsService } from "../clients/clients.service";
import { RealtimeGateway } from "./realtime.gateway";

const CLIENT_ID = "3f4f8228-c9d7-4b0f-b95a-c7cfd960fe71";

describe("RealtimeGateway security", () => {
  const jwtService = { verifyAsync: jest.fn() };
  const configService = {
    get: jest.fn((key: string, fallback?: string) =>
      key === "FRONTEND_URL" ? "https://app.example.com" : fallback,
    ),
  };
  const clientsService = { assertGestorOwnsClient: jest.fn() };
  let gateway: RealtimeGateway;

  function socket(overrides: {
    origin?: string;
    authToken?: string;
    queryToken?: string;
    clientId?: string;
  }): Socket {
    return {
      data: {},
      handshake: {
        auth: overrides.authToken ? { token: overrides.authToken } : {},
        headers: overrides.origin ? { origin: overrides.origin } : {},
        query: {
          ...(overrides.clientId ? { client_id: overrides.clientId } : {}),
          ...(overrides.queryToken ? { token: overrides.queryToken } : {}),
        },
      },
      join: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new RealtimeGateway(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      clientsService as unknown as ClientsService,
    );
    gateway.server = { to: jest.fn(() => ({ emit: jest.fn() })) } as never;
  });

  it("rejects a gestor that does not own the requested client", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "gestor-1",
      role: Role.GESTOR,
      type: "access",
    });
    clientsService.assertGestorOwnsClient.mockRejectedValue(
      new Error("forbidden"),
    );
    const client = socket({
      origin: "https://app.example.com",
      authToken: "jwt",
      clientId: CLIENT_ID,
    });

    await gateway.handleConnection(client);

    expect(clientsService.assertGestorOwnsClient).toHaveBeenCalledWith(
      "gestor-1",
      CLIENT_ID,
    );
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("does not emit to an unauthorized tenant when a rejected socket disconnects", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "gestor-1",
      role: Role.GESTOR,
      type: "access",
    });
    clientsService.assertGestorOwnsClient.mockRejectedValue(
      new Error("forbidden"),
    );
    const client = socket({
      origin: "https://app.example.com",
      authToken: "jwt",
      clientId: CLIENT_ID,
    });

    await gateway.handleConnection(client);
    gateway.handleDisconnect(client);

    expect(gateway.server.to).not.toHaveBeenCalled();
  });

  it("allows a gestor to join only a client it owns", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "gestor-1",
      role: Role.GESTOR,
      type: "access",
    });
    clientsService.assertGestorOwnsClient.mockResolvedValue({ id: CLIENT_ID });
    const client = socket({
      origin: "https://app.example.com",
      authToken: "jwt",
      clientId: CLIENT_ID,
    });

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith(`client:${CLIENT_ID}`);
    expect(client.data.authorizedClientIds).toEqual([CLIENT_ID]);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("does not accept an access token from the URL query string", async () => {
    const client = socket({
      origin: "https://app.example.com",
      queryToken: "jwt-in-url",
      clientId: CLIENT_ID,
    });

    await gateway.handleConnection(client);

    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("rejects malformed client identifiers", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "gestor-1",
      role: Role.GESTOR,
      type: "access",
    });
    const client = socket({
      origin: "https://app.example.com",
      authToken: "jwt",
      clientId: "not-a-uuid",
    });

    await gateway.handleConnection(client);

    expect(clientsService.assertGestorOwnsClient).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});

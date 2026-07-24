import { PrismaService } from '../../config/prisma.service';
import { IntegrationCredentialsService } from './integration-credentials.service';

describe('IntegrationCredentialsService', () => {
  const clientId = '11111111-1111-4111-8111-111111111111';
  const gestorId = '22222222-2222-4222-8222-222222222222';
  const now = new Date();
  const prisma = {
    client: {
      findFirst: jest.fn(),
    },
    integrationCredential: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: IntegrationCredentialsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.client.findFirst.mockResolvedValue({ id: clientId });
    service = new IntegrationCredentialsService(prisma as unknown as PrismaService);
  });

  it('armazena apenas o hash e retorna o segredo uma unica vez na criacao', async () => {
    prisma.integrationCredential.create.mockImplementation(async ({ data }) => ({
      id: 'credential-1',
      ...data,
      created_at: now,
      revoked_at: null,
      last_used_at: null,
    }));

    const result = await service.create(gestorId, clientId, { name: 'n8n principal' });
    const createData = prisma.integrationCredential.create.mock.calls[0][0].data;

    expect(result.key).toMatch(/^lfi_[A-Za-z0-9_-]{43}$/);
    expect(createData.key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(createData).not.toHaveProperty('key');
    expect(createData.key_hash).not.toContain(result.key);
  });

  it('lista metadados sem expor o hash', async () => {
    prisma.integrationCredential.findMany.mockResolvedValue([
      {
        id: 'credential-1',
        client_id: clientId,
        name: 'n8n principal',
        key_prefix: 'lfi_visible-prefix',
        key_hash: 'secret-hash',
        created_at: now,
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
      },
    ]);

    const [result] = await service.list(gestorId, clientId);

    expect(result).not.toHaveProperty('key_hash');
    expect(result).not.toHaveProperty('key');
    expect(result.key_prefix).toBe('lfi_visible-prefix');
  });

  it('rotaciona de forma atomica revogando a credencial anterior', async () => {
    prisma.integrationCredential.findFirst.mockResolvedValue({
      id: 'credential-old',
      client_id: clientId,
      name: 'n8n principal',
      expires_at: null,
      revoked_at: null,
    });
    const transactionCredential = {
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'credential-new',
        ...data,
        created_at: now,
        revoked_at: null,
        last_used_at: null,
      })),
    };
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({ integrationCredential: transactionCredential }),
    );

    const result = await service.rotate(gestorId, clientId, 'credential-old');

    expect(transactionCredential.update).toHaveBeenCalledWith({
      where: { id: 'credential-old' },
      data: { revoked_at: expect.any(Date) },
    });
    expect(result.id).toBe('credential-new');
    expect(result.key).toMatch(/^lfi_/);
  });
});

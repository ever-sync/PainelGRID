import { MetaController } from './meta.controller';

describe('MetaController', () => {
  const service = {
    verifyWebhook: jest.fn(),
    receiveWebhook: jest.fn(),
  };

  const configService = {
    get: jest.fn().mockReturnValue('http://localhost:5173'),
  };

  const controller = new MetaController(service as never, configService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates webhook verification', async () => {
    service.verifyWebhook.mockResolvedValue('ok');
    const result = await controller.verifyWebhook('subscribe', 'token', 'challenge');
    expect(service.verifyWebhook).toHaveBeenCalledWith('subscribe', 'token', 'challenge');
    expect(result).toBe('ok');
  });

  it('delegates webhook receive with signature and rawBody', async () => {
    service.receiveWebhook.mockResolvedValue({ received: true });
    const payload = { object: 'page' };
    const request = { rawBody: Buffer.from('payload') };

    const result = await controller.receiveWebhook(payload, 'sha256=abc', request as never);

    expect(service.receiveWebhook).toHaveBeenCalledWith(payload, 'sha256=abc', request.rawBody);
    expect(result).toEqual({ received: true });
  });
});

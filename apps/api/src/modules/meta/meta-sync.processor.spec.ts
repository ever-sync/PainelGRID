import type { Job } from 'bullmq';
import { MetaSyncProcessor } from './meta-sync.processor';
import type { MetaService } from './meta.service';

describe('MetaSyncProcessor', () => {
  const processor = new MetaSyncProcessor({} as MetaService);

  it.each([
    ['full-sync', 'handleFullSync'],
    ['historical-leads', 'handleHistoricalLeads'],
    ['token-refresh', 'handleTokenRefresh'],
  ] as const)('roteia o job %s para o handler correto', async (name, handler) => {
    const spy = jest.spyOn(processor, handler).mockResolvedValue(undefined);
    const job = { name, data: {} } as Job;

    await processor.process(job);

    expect(spy).toHaveBeenCalledWith(job);
  });

  it('rejeita nomes de job desconhecidos', async () => {
    await expect(
      processor.process({ name: 'desconhecido', data: {} } as Job),
    ).rejects.toThrow('Job Meta desconhecido: desconhecido');
  });
});

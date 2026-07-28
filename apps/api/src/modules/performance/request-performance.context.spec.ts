import { RequestPerformanceContext } from './request-performance.context';

describe('RequestPerformanceContext', () => {
  it('soma duração e quantidade de queries dentro da requisição', async () => {
    await RequestPerformanceContext.run(async () => {
      await Promise.resolve();
      RequestPerformanceContext.recordDatabaseQuery(25);
      RequestPerformanceContext.recordDatabaseQuery(80);

      expect(RequestPerformanceContext.current()).toEqual({
        databaseDurationMs: 105,
        databaseQueryCount: 2,
        slowestQueryMs: 80,
      });
    });
  });
});

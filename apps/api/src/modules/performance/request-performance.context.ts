import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestPerformanceState {
  databaseDurationMs: number;
  databaseQueryCount: number;
  slowestQueryMs: number;
}

const storage = new AsyncLocalStorage<RequestPerformanceState>();

export const RequestPerformanceContext = {
  run<T>(callback: () => T): T {
    return storage.run(
      {
        databaseDurationMs: 0,
        databaseQueryCount: 0,
        slowestQueryMs: 0,
      },
      callback,
    );
  },

  recordDatabaseQuery(durationMs: number): void {
    const current = storage.getStore();
    if (!current) return;
    current.databaseDurationMs += durationMs;
    current.databaseQueryCount += 1;
    current.slowestQueryMs = Math.max(current.slowestQueryMs, durationMs);
  },

  current(): RequestPerformanceState {
    return (
      storage.getStore() ?? {
        databaseDurationMs: 0,
        databaseQueryCount: 0,
        slowestQueryMs: 0,
      }
    );
  },
};

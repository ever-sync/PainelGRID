/**
 * Corre uma promise com um teto de tempo. Usado em chamadas de bootstrap que dependem
 * de Redis (ex.: agendamento de jobs via BullMQ): com `maxRetriesPerRequest: null` no
 * `BullModule`, uma conexao que nunca reconecta (`retryStrategy: () => null`) deixa
 * comandos pendentes presos para sempre em vez de rejeitar — sem esse teto, o
 * `onModuleInit` trava e a aplicacao nunca chega a `app.listen()`.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} excedeu ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

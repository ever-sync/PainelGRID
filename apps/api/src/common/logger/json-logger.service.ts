import { ConsoleLogger, LogLevel } from "@nestjs/common";

/**
 * Logger estruturado em JSON para produção (sem dependências extras).
 * Em produção emite uma linha JSON por evento — fácil de ingerir por
 * agregadores (Datadog, Logtail, BetterStack, ELK).
 * Em dev mantém o output colorido padrão do Nest.
 *
 * Habilitado quando NODE_ENV=production OU LOG_FORMAT=json.
 */
export class JsonLogger extends ConsoleLogger {
  private readonly jsonMode: boolean;

  constructor(context?: string) {
    super(context ?? "App");
    this.jsonMode =
      process.env.LOG_FORMAT === "json" ||
      process.env.NODE_ENV === "production";
  }

  protected printMessages(
    messages: unknown[],
    context?: string,
    level: LogLevel = "log",
  ): void {
    if (!this.jsonMode) {
      return super.printMessages(messages, context, level);
    }

    for (const message of messages) {
      const entry = this.toJsonEntry(message, context, level);
      const stream =
        level === "error" || level === "warn" ? process.stderr : process.stdout;
      stream.write(`${JSON.stringify(entry)}\n`);
    }
  }

  private toJsonEntry(
    message: unknown,
    context: string | undefined,
    level: LogLevel,
  ) {
    const base: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      context: context ?? this.context ?? "App",
      pid: process.pid,
    };

    if (message instanceof Error) {
      base.message = message.message;
      base.stack = message.stack;
      return base;
    }

    if (typeof message === "string") {
      base.message = message;
      return base;
    }

    if (message && typeof message === "object") {
      base.message = (message as { message?: string }).message;
      base.payload = message;
      return base;
    }

    base.message = String(message);
    return base;
  }
}

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

/**
 * Caminhos para `.env` usados pelo ConfigModule e pela reidratação em `validateEnvironment`.
 * Este arquivo fica em `src/config/` → compilado em `dist/config/`; `__dirname` sobe até a raiz do monorepo.
 * Inclui fallbacks por `cwd` (npm workspaces / monorepo).
 */
export function getApiEnvFilePaths(): string[] {
  const fromThisFile = [
    join(__dirname, "../../../../.env"),
    join(__dirname, "../../.env"),
  ];
  const fromCwd = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "..", ".env"),
    join(process.cwd(), "..", "..", ".env"),
  ];
  return [...new Set([...fromThisFile, ...fromCwd])];
}

/** Mesma regra de merge que `@nestjs/config` em `loadEnvFile` (primeiro arquivo listado “ganha” em chaves repetidas). */
export function mergeEnvFilesNestOrder(
  paths: string[],
): Record<string, string> {
  let config: Record<string, string> = {};
  for (const envFilePath of paths) {
    if (existsSync(envFilePath)) {
      config = Object.assign(dotenv.parse(readFileSync(envFilePath)), config);
    }
  }
  return config;
}

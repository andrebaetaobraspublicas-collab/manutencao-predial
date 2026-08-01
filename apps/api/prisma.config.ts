import { config as loadEnvironment } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// O npm workspace normalmente executa os comandos a partir de apps/api. O
// fallback permite executar o Prisma também a partir da raiz do monorepo.
const workspaceEnv = resolve(process.cwd(), '../../.env');
const rootEnv = resolve(process.cwd(), '.env');
loadEnvironment({ path: existsSync(workspaceEnv) ? workspaceEnv : rootEnv });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});

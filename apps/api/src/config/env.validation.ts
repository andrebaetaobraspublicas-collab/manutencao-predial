export type AppEnvironment = Record<string, unknown> & {
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
};

export function validateEnvironment(config: Record<string, unknown>): AppEnvironment {
  const databaseUrl = String(config.DATABASE_URL ?? '');
  const jwtSecret = String(config.JWT_ACCESS_SECRET ?? '');

  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error('DATABASE_URL deve ser uma URL MySQL válida.');
  }

  if (jwtSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET deve possuir pelo menos 32 caracteres.');
  }

  return config as AppEnvironment;
}

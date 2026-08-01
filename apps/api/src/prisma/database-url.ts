export type MariaDbAdapterOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
};

export function parseMySqlUrl(databaseUrl: string): MariaDbAdapterOptions {
  const parsed = new URL(databaseUrl);

  if (parsed.protocol !== 'mysql:') {
    throw new Error('A conexão configurada não utiliza o protocolo mysql://');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL não informa o nome do banco de dados.');
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  };
}

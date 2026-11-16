import { ForbiddenException } from '@nestjs/common';
import mariadb, { Pool } from 'mariadb';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client';
import { parseMySqlUrl } from '../../prisma/database-url';

const reads = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);
/** Source clients are not injected as the primary client and expose no writes/raw SQL. */
export function readonlyPrisma<T extends object>(client: T): T {
  return new Proxy(client, { get(target, property) {
    if (property === '$disconnect') return (target as any).$disconnect.bind(target);
    if (typeof property !== 'string' || property.startsWith('$') || property.startsWith('_')) throw new ForbiddenException('Operação não permitida na origem somente leitura.');
    const model = (target as any)[property];
    if (!model || typeof model !== 'object') throw new ForbiddenException('Origem somente leitura.');
    return new Proxy(model, { get(delegate, operation) {
      if (!reads.has(String(operation))) throw new ForbiddenException('Gravações nos orçamentadores são proibidas.');
      return (...args: unknown[]) => delegate[operation](...args);
    }});
  }});
}
export function sourcePrisma(url: string) {
  return readonlyPrisma(new PrismaClient({ adapter: new PrismaMariaDb({ ...parseMySqlUrl(url), connectionLimit: 1 }) }));
}
export function assertReadQuery(sql: string) {
  if (!/^\s*SELECT\s/i.test(sql) || /;|\b(INTO|OUTFILE|DUMPFILE|FOR\s+UPDATE|LOCK\s+IN|GET_LOCK|RELEASE_LOCK|SLEEP|BENCHMARK)\b/i.test(sql)) throw new ForbiddenException('Consulta não permitida na origem somente leitura.');
}
export class ReadonlySourceSql {
  private pool?: Pool;
  constructor(private readonly url: string) {}
  enabled() { return true; }
  async query<T = any>(sql: string, values: unknown[] = []): Promise<T> {
    assertReadQuery(sql);
    this.pool ??= mariadb.createPool({ ...parseMySqlUrl(this.url), connectionLimit: 1, multipleStatements: false, acquireTimeout: 10000, decimalAsNumber: false, bigIntAsNumber: false });
    const connection = await this.pool.getConnection();
    try {
      await connection.query('START TRANSACTION READ ONLY');
      return await connection.query(sql, values) as T;
    } finally { try { await connection.rollback(); } finally { connection.release(); } }
  }
  async close() { await this.pool?.end(); }
}

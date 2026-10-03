import { HttpException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mariadb, { type Pool, type PoolConnection } from 'mariadb';
import { parseMySqlUrl } from '../../prisma/database-url';

export type InfraSql = Pick<PoolConnection, 'query'>;
@Injectable()
export class InfraDatabase implements OnModuleDestroy {
  private pool?: Pool;
  constructor(private readonly config: ConfigService) {}
  private failure(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    // Driver exceptions can contain SQL, project JSON and connection details.
    // Never pass their message/cause to Nest's default exception logger.
    const safe = new ServiceUnavailableException('Banco do OrçaPro Infraestrutura temporariamente indisponível.');
    const code = (error as { code?: unknown })?.code;
    if (typeof code === 'string' && /^[A-Z0-9_]{2,60}$/.test(code)) Object.assign(safe,{ code });
    return safe;
  }
  enabled(): boolean { return this.config.get<string>('INFRA_ENABLED') === 'true'; }
  private connection(): Pool {
    if (!this.enabled()) throw new ServiceUnavailableException('OrçaPro Infraestrutura não está habilitado neste ambiente.');
    if (!this.pool) {
      const supplied = this.config.get<string>('INFRA_DATABASE_URL');
      if (!supplied) throw new ServiceUnavailableException('Banco independente do OrçaPro Infraestrutura não configurado.');
      const options = parseMySqlUrl(supplied);
      const primary = this.config.get<string>('DATABASE_URL');
      if (primary) {
        const identity = parseMySqlUrl(primary);
        if (identity.host === options.host && identity.port === options.port && identity.database === options.database) {
          throw new ServiceUnavailableException('O banco Infraestrutura precisa ser separado do banco dos outros programas.');
        }
      }
      this.pool = mariadb.createPool({ ...options, connectionLimit: 3, acquireTimeout: 10000,
        bigIntAsNumber: false, decimalAsNumber: false, insertIdAsNumber: false,
      });
    }
    return this.pool;
  }
  async query<T = any>(sql: string, values: unknown[] = []): Promise<T> {
    try { return await this.connection().query(sql,values) as T; }
    catch (error) { throw this.failure(error); }
  }
  async transaction<T>(fn: (db: InfraSql) => Promise<T>): Promise<T> {
    let db: PoolConnection;
    try { db = await this.connection().getConnection(); } catch (error) { throw this.failure(error); }
    try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
    catch (error) { await db.rollback().catch(() => undefined); throw this.failure(error); }
    finally { db.release(); }
  }
  async onModuleDestroy() { if (this.pool) await this.pool.end(); }
}

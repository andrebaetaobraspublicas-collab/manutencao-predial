import { versionRetentionEnabled } from '../../common/version-retention';
import { ConflictException, HttpException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mariadb, { Pool, PoolConnection } from 'mariadb';
import { parseMySqlUrl } from '../../prisma/database-url';
import { contractEnvironment, contractProduction } from './contract-environment';

export type ContractSql = Pick<PoolConnection, 'query'>;
export function developmentHost(url: string): boolean {
  try { return ['gestaodepredios.com.br','www.gestaodepredios.com.br','localhost','127.0.0.1'].includes(new URL(url).hostname); } catch { return false; }
}
@Injectable()
export class ContractDatabase implements OnModuleDestroy {
  private pool?: Pool;
  constructor(private readonly config: ConfigService) {}
  enabled() { return contractEnvironment(this.config); }
  production() { return contractProduction(this.config); }
  retentionEnabled() { return versionRetentionEnabled(this.config); }
  configured() { return !!this.config.get('GESTAO_DATABASE_URL'); }
  private connection() {
    if (!this.enabled()) throw new NotFoundException('Gestão Contratual indisponível neste ambiente.');
    if (!this.pool) {
      const url = this.config.get<string>('GESTAO_DATABASE_URL');
      if (!url) throw new ServiceUnavailableException('Banco próprio de Gestão Contratual não configurado.');
      const options = parseMySqlUrl(url);
      for (const key of [...(contractProduction(this.config) ? [] : ['DATABASE_URL']), 'INFRA_DATABASE_URL','GESTAO_SOURCE_ORCAPRO_AUTH_URL','GESTAO_SOURCE_INFRA_AUTH_URL','GESTAO_SOURCE_INFRA_DATA_URL']) {
        const other = this.config.get<string>(key);
        if (other && parseMySqlUrl(other).database === options.database) throw new ServiceUnavailableException('Gestão Contratual exige um banco exclusivo.');
      }
      this.pool = mariadb.createPool({...options,connectionLimit:2,decimalAsNumber:false,bigIntAsNumber:false,acquireTimeout:10000});
    }
    return this.pool;
  }
  private safe(e: unknown): never {
    if (e instanceof HttpException) throw e;
    if ((e as {code?:string})?.code === 'ER_DUP_ENTRY') throw new ConflictException('Registro já cadastrado. Atualize a lista para conferir o acesso ou plano existente.');
    throw new ServiceUnavailableException('Banco de Gestão Contratual indisponível; nenhuma alteração foi confirmada.');
  }
  async query<T = any>(sql: string, values: unknown[] = []): Promise<T> {
    try { return await this.connection().query(sql,values) as T; } catch(e) { return this.safe(e); }
  }
  async transaction<T>(fn: (db: ContractSql) => Promise<T>): Promise<T> {
    let db: PoolConnection | undefined;
    try { db = await this.connection().getConnection();await db.beginTransaction();const result = await fn(db);await db.commit();return result; }
    catch(e) { if(db) await db.rollback().catch(()=>undefined);return this.safe(e); }
    finally { db?.release(); }
  }
  async onModuleDestroy() { await this.pool?.end(); }
}

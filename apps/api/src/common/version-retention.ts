import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from './types/authenticated-user';

type Config = { get<T = string>(key: string): T | undefined };
export function versionRetentionEnabled(config?: Config): boolean {
  if (productionVersionRetentionEnabled(config) || infraProductionVersionRetentionEnabled(config)) return true;
  if (config?.get('VERSION_RETENTION_DEV') !== 'true') return false;
  try {
    return ['gestaodepredios.com.br', 'www.gestaodepredios.com.br'].includes(new URL(String(config.get('WEB_BASE_URL'))).hostname)
      && new URL(String(config.get('DATABASE_URL'))).pathname === '/u296746636_gestaopredios';
  } catch { return false; }
}
/** Explicit opt-in for the commercial OrçaPro database only. */
export function productionVersionRetentionEnabled(config?: Config): boolean {
  if (config?.get('VERSION_RETENTION_ORCAPRO_PROD') !== 'true') return false;
  try {
    return new URL(String(config.get('WEB_BASE_URL'))).origin === 'https://sistema.orcaproobras.com.br'
      && new URL(String(config.get('DATABASE_URL'))).pathname === '/u528277311_orcapro_live';
  } catch { return false; }
}
export function infraProductionVersionRetentionEnabled(config?: Config): boolean {
  if (config?.get('VERSION_RETENTION_INFRA_PROD') !== 'true') return false;
  try {
    return new URL(String(config.get('WEB_BASE_URL'))).origin === 'https://orcaproinfra.com.br'
      && new URL(String(config.get('DATABASE_URL'))).pathname === '/u528277311_infra_auth'
      && new URL(String(config.get('INFRA_DATABASE_URL'))).pathname === '/u528277311_infra_live';
  } catch { return false; }
}
export function historySession(user: AuthenticatedUser): string | null {
  return user.workSessionId ? createHash('sha256').update(`${user.tenantId}:${user.userId}:${user.workSessionId}`).digest('hex') : null;
}
export function historyDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export type HistoryRow = { version: number; session_key: string | null; work_day: string; created_at: Date; superseded_at?: Date | string | null; protected?: boolean };
/** Recovery starts when replaced, not when originally created. Unknown sessions are never discarded. */
export function disposableVersions(rows: HistoryRow[], now = new Date()): number[] {
  const latest = new Map<string, number>();
  const current = Math.max(0, ...rows.map(r => r.version));
  for (const r of rows) if (r.session_key) {
    const key = `${r.session_key}:${r.work_day}`;
    latest.set(key, Math.max(latest.get(key) || 0, r.version));
  }
  return rows.filter(r => r.session_key && !r.protected && r.version !== current &&
    r.version < latest.get(`${r.session_key}:${r.work_day}`)! && r.superseded_at &&
    now.getTime() - new Date(r.superseded_at).getTime() >= 86400000).map(r => r.version);
}
export const historySql = `INSERT INTO VersionRetention(entity_id,version,tenant_id,actor_id,session_key,work_day,protected,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`;
export const supersedeHistorySql = `UPDATE VersionRetention older JOIN VersionRetention latest ON older.entity_id=latest.entity_id AND older.tenant_id=latest.tenant_id AND older.session_key=latest.session_key AND older.work_day=latest.work_day SET older.superseded_at=COALESCE(older.superseded_at,UTC_TIMESTAMP(3)) WHERE latest.entity_id=? AND latest.tenant_id=? AND latest.version=? AND older.version<latest.version`;
export function supersedeHistoryValues(user: AuthenticatedUser, id: string, version: number) {
  return [id, user.tenantId, version];
}
export function historyValues(user: AuthenticatedUser, id: string, version: number, protectedVersion = false) {
  return [id, version, user.tenantId, user.userId, historySession(user), historyDay(), protectedVersion ? 1 : 0];
}

export function annotateHistory<T extends {version: number}>(versions: T[], metadata: HistoryRow[]) {
  const latest = new Map<string, number>();
  for (const r of metadata) if(r.session_key) { const key = `${r.session_key}:${r.work_day}`; latest.set(key, Math.max(latest.get(key)||0,r.version)); }
  const byVersion = new Map(metadata.map(r => [r.version,r]));
  return versions.map(v => { const r=byVersion.get(v.version); const recovery=!!r?.session_key && !r.protected && v.version < latest.get(`${r.session_key}:${r.work_day}`)!;
    return {...v, retentionState: recovery ? 'RECOVERY' : 'KEPT', recoveryUntil: recovery && r?.superseded_at ? new Date(new Date(r.superseded_at).getTime()+86400000).toISOString() : null}; });
}

export function effectiveDocument(value: unknown): string {
  const copy = JSON.parse(JSON.stringify(value));
  if(copy && typeof copy === 'object' && !Array.isArray(copy)) delete copy.updated;
  return JSON.stringify(copy, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
}

// Read UTC explicitly: drivers may otherwise interpret MySQL DATETIME in the OS timezone.
export const historySelectSql = `SELECT version,session_key,work_day,protected,DATE_FORMAT(superseded_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS superseded_at FROM VersionRetention WHERE entity_id=? AND tenant_id=?`;

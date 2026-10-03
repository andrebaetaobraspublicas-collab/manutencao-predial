import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { connectInfra,safeFailure } from './infraestrutura-import-lib.mjs';
config({ path: process.env.INFRA_ENV_FILE || '../../.env',override: false,quiet: true });
export async function purgePersonalData(pool,environment = process.env) {
  const configured = Number(environment.INFRA_DELETED_DATA_RETENTION_DAYS ?? 30);
  const days = Number.isInteger(configured) && configured >= 1 && configured <= 365 ? configured : 30;
  const db = await pool.getConnection(); let total = 0;
  try {
    await db.beginTransaction();
    const due = await db.query('SELECT external_user_id,tenant_id FROM InfraUser WHERE erasure_requested_at IS NOT NULL AND status=\'BLOCKED\' AND erasure_requested_at <= DATE_SUB(UTC_TIMESTAMP(3),INTERVAL ? DAY) ORDER BY erasure_requested_at LIMIT 100 FOR UPDATE',[days]);
    for (const profile of due) {
      const user = profile.external_user_id, tenant = profile.tenant_id, anonymous = randomUUID();
      // Administrative records use the actor tenant; target tenant is recorded
      // in payload. Evaluate that scope before clearing payload, so erasure of
      // one membership cannot modify records of the same user in another tenant.
      await db.query('UPDATE InfraCycle c SET imported_by=? WHERE imported_by=? AND EXISTS(SELECT 1 FROM InfraAudit a WHERE a.entity=\'cycle\' AND a.entity_id=c.id AND a.user_id=? AND a.tenant_id=?)',[anonymous,user,user,tenant]);
      const own = '(a.user_id=? AND a.tenant_id=?)';
      const target = '(a.entity=\'user\' AND a.entity_id=? AND (a.tenant_id=? OR JSON_UNQUOTE(JSON_EXTRACT(a.payload,\'$.customerTenantId\'))=?))';
      const project = 'EXISTS(SELECT 1 FROM InfraProject p WHERE p.id=a.entity_id AND p.user_id=? AND p.tenant_id=?)';
      await db.query(`UPDATE InfraAudit a SET user_id=CASE WHEN ${own} THEN ? ELSE a.user_id END,entity_id=CASE WHEN ${target} OR ${project} THEN ? ELSE a.entity_id END,payload=NULL WHERE ${own} OR ${target} OR ${project}`,
        [user,tenant,anonymous,user,tenant,tenant,user,tenant,anonymous,user,tenant,user,tenant,tenant,user,tenant]);
      await db.query('DELETE v FROM InfraProjectVersion v JOIN InfraProject p ON p.id=v.project_id WHERE p.user_id=? AND p.tenant_id=?',[user,tenant]);
      await db.query('DELETE FROM InfraProject WHERE user_id=? AND tenant_id=?',[user,tenant]);
      await db.query('DELETE FROM InfraOwnRecord WHERE user_id=? AND tenant_id=?',[user,tenant]);
      await db.query('DELETE FROM InfraSetting WHERE user_id=? AND tenant_id=?',[user,tenant]);
      await db.query('DELETE FROM InfraUser WHERE external_user_id=? AND tenant_id=?',[user,tenant]);
      await db.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?,?)',[randomUUID(),'00000000-0000-0000-0000-000000000000',anonymous,'lgpd.erasure.completed','anonymous-account',anonymous,JSON.stringify({ retentionDays: days,globalCatalogPreserved: true,sharedIdentityPreserved: true,minimumAnonymousAudit: true })]);
      total++;
    }
    // Login buckets are ephemeral HMAC metadata. Retain current windows and
    // every unexpired block; remove only records inactive for seven days.
    const counters = await db.query('DELETE FROM InfraLoginAttempt WHERE last_seen_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY) AND (blocked_until IS NULL OR blocked_until<UTC_TIMESTAMP(3))');
    await db.commit(); return { erasedProfiles: total,retentionDays: days,expiredLoginBuckets: Number(counters.affectedRows) };
  } catch (error) { await db.rollback().catch(() => {}); throw error; }
  finally { db.release(); }
}
if (process.argv[1]?.replaceAll('\\','/').endsWith('/infraestrutura-purge.mjs')) {
  let pool;
  try { pool = connectInfra(); console.log(JSON.stringify(await purgePersonalData(pool))); }
  catch (error) { console.error(safeFailure(error,'Expurgo Infraestrutura falhou; confira as migrations.')); process.exitCode = 1; }
  finally { if (pool) await pool.end(); }
}

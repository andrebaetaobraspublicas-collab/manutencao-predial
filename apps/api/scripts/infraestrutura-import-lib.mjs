import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import mariadb from 'mariadb';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const runtime = require(resolve(here,'../src/modules/infraestrutura/assets/legacy-runtime.cjs'));
const { utcTypeCast } = require(resolve(here,'../src/modules/infraestrutura/assets/infra-utc-db.cjs'));
export const digest = value => createHash('sha256').update(value).digest('hex');
const stringify = value => JSON.stringify(value);
// Only diagnostics created here are suitable for persisted validation or CLI
// output. SQL, JSON parsing and URL errors may contain submitted values.
export class InfraImportError extends Error {}
export function safeFailure(error,fallback = 'Falha operacional no módulo Infraestrutura.') {
  if (error instanceof InfraImportError) return error.message;
  const code = error && typeof error === 'object' && /^[A-Z0-9_]{2,60}$/.test(String(error.code ?? '')) ? ` Código: ${error.code}.` : '';
  return `${fallback}${code}`;
}
async function seedBytes(path, maximum = 40 * 1024 * 1024) {
  const file = await readFile(path);
  const bytes = file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file,{ maxOutputLength: maximum }) : file;
  if (bytes.length > maximum) throw new InfraImportError('Arquivo de seed excede o limite permitido.');
  return bytes;
}
export function connectionOptions(databaseUrl, primaryUrl) {
  let value; try { value = new URL(databaseUrl); } catch { throw new InfraImportError('INFRA_DATABASE_URL inválida.'); }
  if (value.protocol !== 'mysql:' || !value.hostname || !value.pathname.slice(1)) throw new InfraImportError('INFRA_DATABASE_URL inválida.');
  if (primaryUrl) {
    let primary; try { primary = new URL(primaryUrl); } catch { throw new InfraImportError('DATABASE_URL principal inválida.'); }
    if (primary.hostname === value.hostname && (primary.port || '3306') === (value.port || '3306') && decodeURIComponent(primary.pathname) === decodeURIComponent(value.pathname)) throw new InfraImportError('O banco Infraestrutura deve ser independente do banco principal.');
  }
  return { host: value.hostname,port: Number(value.port || 3306),database: decodeURIComponent(value.pathname.slice(1)),user: decodeURIComponent(value.username),password: decodeURIComponent(value.password),timezone: 'Z',typeCast: utcTypeCast,connectionLimit: 2,decimalAsNumber: false,bigIntAsNumber: false };
}
export function connectInfra(environment = process.env) {
  if (environment.INFRA_ENABLED !== 'true' || !environment.INFRA_DATABASE_URL) throw new InfraImportError('Ative INFRA_ENABLED e configure INFRA_DATABASE_URL independente.');
  return mariadb.createPool(connectionOptions(environment.INFRA_DATABASE_URL,environment.DATABASE_URL));
}
async function transaction(pool, fn) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
  catch (error) { await db.rollback().catch(() => {}); throw error; }
  finally { db.release(); }
}
const decimal = (value,scale = 8) => value == null ? null : (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(scale) : (() => { throw new InfraImportError('Valor decimal SICRO inválido.'); })());
const amount = cents => cents == null ? null : decimal(cents / 100);
function checkShape(raw) {
  if (!raw || raw.fonte !== 'SICRO' || !Array.isArray(raw.ufs) || !raw.ufs.length || !Array.isArray(raw.ins?.c) || !Array.isArray(raw.comp?.c)) throw new InfraImportError('Snapshot SICRO raw-v1 inválido.');
  // The preserved SICRO motor deliberately uses UF vector index zero. A cycle
  // is therefore one state photograph, never a multi-state price container.
  if (raw.ufs.length !== 1 || (raw.uf && raw.uf !== raw.ufs[0])) throw new InfraImportError('O ciclo SICRO deve conter uma única UF consistente com sua fotografia.');
  if (raw.ins.c.length > 100000 || raw.comp.c.length > 100000) throw new InfraImportError('Catálogo excede o limite de registros.');
  for (const kind of ['ins','comp']) {
    const count = raw[kind].c.length;
    for (const key of kind === 'ins' ? ['k','d','u','o','p'] : ['g','d','u','P','F','A','B','C','D','E','T','X','o']) {
      if (!Array.isArray(raw[kind][key]) || raw[kind][key].length !== count) throw new InfraImportError(`Vetor SICRO ${kind}.${key} divergente.`);
    }
    if (new Set(raw[kind].c.map(String)).size !== count) throw new InfraImportError(`Código ${kind} duplicado.`);
  }
}
async function insertRows(db, table, columns, rows) {
  // Identifiers are fixed by this module. Only values come from uploaded data.
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset,offset + 100), placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    if (batch.length) await db.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES ${placeholders}`,batch.flat());
  }
}
async function normalize(db,id,raw,pem) {
  const unit = index => String(raw.un?.[index] ?? '');
  const vectors = (section,index) => Object.fromEntries(Object.entries(section).map(([key,value]) => [key,Array.isArray(value) ? value[index] : undefined]).filter(([,value]) => value !== undefined));
  const inputs = raw.ins.c.map((code,index) => {
    const prices = raw.ins.p[index]; const basePrice = Array.isArray(prices) ? prices[0] : prices;
    const labor = raw.ins.lab?.[String(code)];
    const kind = ['M','E','P','A'].includes(String(code)[0]) ? String(code)[0] : ['M','P','E'][raw.ins.k[index]];
    return [id,String(code),kind,String(raw.ins.d[index]),unit(raw.ins.u[index]),amount(basePrice),amount(labor?.CD?.[0] ?? basePrice),amount(labor?.SE?.[0] ?? basePrice),stringify(vectors(raw.ins,index))];
  });
  await insertRows(db,'InfraCycleInput',['cycle_id','code','kind','description','unit','price_sd','price_cd','price_se','data'],inputs);
  const comps = raw.comp.c.map((code,index) => [id,String(code),String(raw.comp.d[index]),unit(raw.comp.u[index]),String(raw.comp.g[index]),decimal(raw.comp.P[index]),decimal(raw.comp.F[index]),amount(raw.comp.o[index]),stringify(vectors(raw.comp,index))]);
  await insertRows(db,'InfraCycleComposition',['cycle_id','code','description','unit','group_code','production','fic','official_cost','data'],comps);
  let items = [];
  for (let index = 0; index < raw.comp.c.length; index++) {
    for (const section of ['A','B','C','D','E','T','X']) {
      const rows = raw.comp[section][index];
      if (!Array.isArray(rows)) throw new InfraImportError('Estrutura analítica SICRO inválida.');
      for (let seq = 0; seq < rows.length; seq++) {
        const row = rows[seq]; let code = null, q = null;
        if (Array.isArray(row)) {
          if (['A','B','C'].includes(section)) { code = raw.ins.c[row[0]]; q = row[1]; }
          else if (section === 'D') { code = raw.comp.c[row[0]]; q = row[1]; }
          else if (section === 'E') { code = row[0]; q = row[2]; }
          else if (section === 'T') { code = row[0]; q = row[1]; }
        }
        items.push([id,String(raw.comp.c[index]),section,seq,code == null ? null : String(code),q == null ? null : decimal(q,12),stringify(row)]);
        if (items.length >= 1000) { await insertRows(db,'InfraCycleItem',['cycle_id','comp_code','section','seq','ref_code','q','data'],items); items = []; }
      }
    }
  }
  await insertRows(db,'InfraCycleItem',['cycle_id','comp_code','section','seq','ref_code','q','data'],items);
  for (const [regime,key] of [['SD','eq'],['CD','eqCD']]) {
    const equipment = raw[key] ?? {};
    await insertRows(db,'InfraCycleEquipmentPart',['cycle_id','code','regime','data'],Object.entries(equipment).map(([code,data]) => [id,code,regime,stringify(data)]));
  }
  await insertRows(db,'InfraCycleTransportItem',['cycle_id','seq','data'],Object.entries(raw.tmat ?? {}).map(([code,data],seq) => [id,seq,stringify({ code,data })]));
  await insertRows(db,'InfraCycleCharge',['cycle_id','name','data'],Object.entries(raw.encargos ?? {}).map(([name,data]) => [id,name,stringify(data)]));
  if (pem) {
    if (!pem || typeof pem !== 'object' || !Array.isArray(pem.pem) || !Array.isArray(pem.names)) throw new InfraImportError('Biblioteca PEM inválida.');
    const sheets = pem.pem.map(data => {
      const code = String(data.c), group = data.g == null ? null : String(data.g);
      return [randomUUID(),id,code,group,stringify({ sheet: data,obs: pem.obs?.[code] ?? null })];
    }).filter(row => row[4] !== null);
    await insertRows(db,'InfraPem',['id','cycle_id','comp_code','group_code','data'],sheets);
    const bytes = Buffer.from(stringify(pem)); await db.query('INSERT INTO InfraPemSnapshot(cycle_id,gz_blob,etag) VALUES(?,?,?)',[id,gzipSync(bytes,{ level: 9 }),digest(bytes)]);
  }
}
async function materialize(pool,cycle,payload,options = {}) {
  if (payload.length > 40 * 1024 * 1024 || payload.length !== Number(cycle.raw_size) || digest(payload) !== cycle.content_hash) throw new InfraImportError('Tamanho ou SHA-256 da referência divergente.');
  const bundle = JSON.parse(payload.toString('utf8')), raw = bundle.raw ?? bundle, pem = bundle.raw ? bundle.pem : options.pem;
  checkShape(raw);
  const ref = /^\d{4}-\d{2}$/.test(raw.ref) ? raw.ref : `${raw.ref.slice(3)}-${raw.ref.slice(0,2)}`;
  if (ref !== cycle.ref || !raw.ufs.includes(cycle.uf)) throw new InfraImportError('UF ou referência não correspondem ao rascunho.');
  const checked = runtime.validateRaw(raw);
  if (!checked.total || checked.ok !== checked.total || checked.mismatch?.length) throw new InfraImportError('Conferência numérica diverge do relatório SICRO.');
  const rawBytes = bundle.raw ? Buffer.from(stringify(raw)) : payload;
  const template = bundle.example ?? options.example ?? runtime.exampleProject(raw,{ pem });
  const validation = { ...checked,status: 'PASSED',ufs: raw.ufs,regimes: raw.regimes,pemNames: pem?.names ?? [],checkedAll: true,sampled: Math.min(200,checked.total),validatedAt: new Date().toISOString(),method: 'Código JavaScript original; r4/r2 e FIC preservados; conferência integral inclui a amostra mínima de 200.' };
  await transaction(pool,async db => {
    const locked = await db.query('SELECT import_status FROM InfraCycle WHERE id=? FOR UPDATE',[cycle.id]);
    if (locked[0]?.import_status !== 'PROCESSING') throw new InfraImportError('Rascunho mudou enquanto era conferido.');
    await normalize(db,cycle.id,raw,pem);
    await db.query('INSERT INTO InfraCycleSnapshot(cycle_id,gz_blob,etag) VALUES(?,?,?)',[cycle.id,gzipSync(rawBytes,{ level: 9 }),digest(rawBytes)]);
    await db.query('UPDATE InfraCycle SET import_status=\'PASSED\',validation=?,example_json=?,processing_at=NULL WHERE id=?',[stringify(validation),stringify(template),cycle.id]);
    await db.query('DELETE FROM InfraCycleChunk WHERE cycle_id=?',[cycle.id]);
    await db.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?,?)',[randomUUID(),options.tenantId ?? '00000000-0000-0000-0000-000000000000',cycle.imported_by,'cycle.validated','cycle',cycle.id,stringify({ compositionCount: checked.compositionCount,checked: checked.ok,sourceSha256: checked.sourceSha256 })]);
  });
  return { id: cycle.id,validation,compressedBytes: gzipSync(rawBytes).length };
}
export async function processQueued(pool,options = {}) {
  // A named lock held on a dedicated connection survives transaction commits.
  // It disappears when the process/connection dies, so the next cron run can
  // reclaim an interrupted queued import without processing it concurrently.
  const lockConnection = await pool.getConnection();
  let lockName;
  try {
    const database = (await lockConnection.query('SELECT DATABASE() AS name'))[0].name;
    lockName = `infra-import-${digest(String(database)).slice(0,40)}`;
    const acquired = (await lockConnection.query('SELECT GET_LOCK(?,0) AS acquired',[lockName]))[0].acquired;
    if (Number(acquired) !== 1) return null;
    return await processClaimed(pool,options);
  } finally {
    if (lockName) await lockConnection.query('SELECT RELEASE_LOCK(?)',[lockName]).catch(() => {});
    lockConnection.release();
  }
}
async function processClaimed(pool,options) {
  const claimed = await transaction(pool,async db => {
    const rows = await db.query('SELECT * FROM InfraCycle WHERE import_status=\'QUEUED\' OR (import_status=\'PROCESSING\' AND EXISTS(SELECT 1 FROM InfraCycleChunk WHERE cycle_id=InfraCycle.id)) ORDER BY imported_at LIMIT 1 FOR UPDATE');
    if (!rows[0]) return null;
    await db.query('UPDATE InfraCycle SET import_status=\'PROCESSING\',processing_at=UTC_TIMESTAMP(3) WHERE id=?',[rows[0].id]);
    return rows[0];
  });
  if (!claimed) return null;
  try {
    const chunks = await pool.query('SELECT seq,sha256,data FROM InfraCycleChunk WHERE cycle_id=? ORDER BY seq',[claimed.id]);
    if (chunks.length !== claimed.expected_chunks || chunks.some((row,index) => row.seq !== index || digest(row.data) !== row.sha256)) throw new InfraImportError('Lotes ausentes ou hash do lote divergente.');
    return await materialize(pool,claimed,Buffer.concat(chunks.map(row => row.data)),options);
  } catch (error) {
    const reason = safeFailure(error,'Falha na conferência SICRO.');
    await pool.query('UPDATE InfraCycle SET import_status=\'FAILED\',processing_at=NULL,validation=? WHERE id=?',[stringify({ status: 'FAILED',reason,validatedAt: new Date().toISOString() }),claimed.id]);
    throw new InfraImportError(`Conferência recusada (${claimed.id}): ${reason}`);
  }
}
export async function seedInfra(pool,options) {
  const rawBytes = await seedBytes(options.rawPath), raw = JSON.parse(rawBytes.toString('utf8'));
  const pem = options.pemPath ? JSON.parse((await seedBytes(options.pemPath,20 * 1024 * 1024)).toString('utf8')) : undefined;
  const example = options.examplePath ? JSON.parse((await seedBytes(options.examplePath,20 * 1024 * 1024)).toString('utf8')) : undefined;
  checkShape(raw);
  const ref = /^\d{4}-\d{2}$/.test(raw.ref) ? raw.ref : `${raw.ref.slice(3)}-${raw.ref.slice(0,2)}`, uf = options.uf ?? raw.uf ?? raw.ufs[0];
  const prior = await pool.query('SELECT id,content_hash,import_status,status FROM InfraCycle WHERE source=\'SICRO\' AND uf=? AND ref=?',[uf,ref]);
  if (prior[0]) {
    if (prior[0].content_hash !== digest(rawBytes)) throw new InfraImportError('Uma referência com outros dados já existe para esta UF e mês.');
    if (prior[0].import_status === 'PASSED') return { id: prior[0].id,reused: true,status: prior[0].status };
    throw new InfraImportError('A referência existente ainda não passou na conferência. Resolva o rascunho antes de repetir o seed.');
  }
  const id = randomUUID(), actor = options.actorUserId;
  if (!/^[\da-f-]{36}$/i.test(actor ?? '')) throw new InfraImportError('Informe actorUserId UUID autenticado para a auditoria do seed.');
  await pool.query('INSERT INTO InfraCycle(id,uf,ref,imported_by,content_hash,raw_size,expected_chunks,import_status,processing_at) VALUES(?,?,?,?,?,?,1,\'PROCESSING\',UTC_TIMESTAMP(3))',[id,uf,ref,actor,digest(rawBytes),rawBytes.length]);
  try {
    const result = await materialize(pool,{ id,uf,ref,imported_by: actor,content_hash: digest(rawBytes),raw_size: rawBytes.length },rawBytes,{ pem,example,tenantId: options.tenantId });
    if (options.publish) {
      await transaction(pool,async db => {
        await db.query('UPDATE InfraCycle SET status=\'PUBLISHED\',published_at=UTC_TIMESTAMP(3) WHERE id=? AND import_status=\'PASSED\' AND status=\'DRAFT\'',[id]);
        await db.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?,?)',[randomUUID(),options.tenantId ?? '00000000-0000-0000-0000-000000000000',actor,'cycle.publish','cycle',id,stringify({ cli: true })]);
      });
    }
    return { ...result,status: options.publish ? 'PUBLISHED' : 'DRAFT' };
  } catch (error) {
    await pool.query('UPDATE InfraCycle SET import_status=\'FAILED\',processing_at=NULL,validation=? WHERE id=?',[stringify({ status: 'FAILED',reason: safeFailure(error,'Falha na conferência SICRO.') }),id]);
    throw error;
  }
}

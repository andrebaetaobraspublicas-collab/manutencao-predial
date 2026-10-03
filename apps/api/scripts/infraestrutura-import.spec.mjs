import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { gzipSync, gunzipSync } from 'node:zlib';
import mariadb from 'mariadb';
import { connectionOptions, digest, seedInfra, processQueued,safeFailure,InfraImportError,exampleTemplate } from './infraestrutura-import-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const legacy = resolve(here,'../../../legacy/infraestrutura-1.8.3');
const require = createRequire(import.meta.url);
const runtime = require(resolve(here,'../src/modules/infraestrutura/assets/legacy-runtime.cjs'));
const configured = process.env.INFRA_IMPORT_TEST_DATABASE_URL;
test('marcador example do raw SICRO não substitui o documento do orçamento',async () => {
  const raw = JSON.parse(gunzipSync(await readFile(resolve(legacy,'base.json.gz'))));
  const example = JSON.parse(await readFile(resolve(legacy,'example-road.json'),'utf8'));
  assert.equal(raw.example,true);
  assert.deepEqual(exampleTemplate(raw,{ example }),example);
  assert.equal(typeof exampleTemplate(raw),'object');
  assert.deepEqual(exampleTemplate({ raw,example }),example);
  assert.throws(() => exampleTemplate({ raw,example: true }),/objeto JSON/);
});
const tableOrder = ['InfraLoginAttempt','InfraAudit','InfraPolicy','InfraSetting','InfraOwnRecord','InfraProjectVersion','InfraProject','InfraPemSnapshot','InfraPem','InfraCycleCharge','InfraCycleTransportItem','InfraCycleEquipmentPart','InfraCycleItem','InfraCycleComposition','InfraCycleInput','InfraCycleSnapshot','InfraCycleChunk','InfraCycle','InfraUser'];
test('pipeline SQL independente preserva 6.619 custos, 3.673 PEM e histórico do catálogo', { skip: !configured,timeout: 180000 },async t => {
  const options = connectionOptions(configured);
  assert.match(options.database,/^infra_import_test_[a-z0-9_]+$/i,'Only an explicitly named disposable import test database may be used');
  const pool = mariadb.createPool(options);
  try {
    for (const name of tableOrder) await pool.query(`DROP TABLE IF EXISTS ${name}`);
    const migration = (await readFile(resolve(here,'../infraestrutura-migrations/001_infraestrutura.sql'),'utf8')).replace(/^\s*--.*$/gm,'');
    for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) await pool.query(statement);
    const actorUserId = randomUUID(),tenantId = randomUUID();
    const seed = { rawPath: resolve(legacy,'base.json.gz'),pemPath: resolve(legacy,'pem.json.gz'),examplePath: resolve(legacy,'example-road.json'),actorUserId,tenantId,publish: true };
    const initial = await seedInfra(pool,seed);
    assert.equal(initial.validation.ok,6619); assert.equal(initial.validation.total,6619); assert.equal(initial.status,'PUBLISHED');
    const snapshots = await pool.query('SELECT gz_blob,etag FROM InfraCycleSnapshot WHERE cycle_id=?',[initial.id]);
    const rawBytes = gunzipSync(snapshots[0].gz_blob), originalBytes = gunzipSync(await readFile(seed.rawPath));
    assert.deepEqual(rawBytes,originalBytes,'The snapshot served by the API is byte-identical to the original SICRO raw');
    assert.equal(snapshots[0].etag,digest(rawBytes)); assert.ok(snapshots[0].gz_blob.length < 1024 * 1024);
    assert.equal(runtime.validateRaw(JSON.parse(rawBytes)).ok,6619);
    const counts = await pool.query('SELECT (SELECT COUNT(*) FROM InfraCycleComposition) AS compositions,(SELECT COUNT(*) FROM InfraCycleInput) AS inputs,(SELECT COUNT(*) FROM InfraPem) AS pem');
    assert.equal(Number(counts[0].compositions),6619); assert.equal(Number(counts[0].inputs),2398); assert.equal(Number(counts[0].pem),3673);
    const pemCheck = await pool.query('SELECT comp_code,data FROM InfraPem WHERE cycle_id=? AND comp_code=?',[initial.id,'0408037']);
    assert.equal(pemCheck[0].comp_code,'0408037');
    const pemRow = typeof pemCheck[0].data === 'string' ? JSON.parse(pemCheck[0].data) : pemCheck[0].data;
    assert.equal(pemRow.sheet.c,'0408037');
    const libraries = await pool.query('SELECT gz_blob FROM InfraPemSnapshot WHERE cycle_id=?',[initial.id]);
    const pem = JSON.parse(gunzipSync(libraries[0].gz_blob));
    const project = JSON.parse(await readFile(seed.examplePath,'utf8')), calculated = runtime.calculateProject(JSON.parse(rawBytes),project,{ pem });
    assert.equal(calculated.workDays,172); assert.equal(calculated.items.length,64);
    assert.equal(calculated.totals.direct,2964114491); assert.equal(calculated.totals.price,3563786534);
    const repeated = await seedInfra(pool,seed); assert.equal(repeated.id,initial.id); assert.equal(repeated.reused,true);
    const storedExample = (await pool.query('SELECT example_json FROM InfraCycle WHERE id=?',[initial.id]))[0].example_json;
    assert.deepEqual(typeof storedExample === 'string' ? JSON.parse(storedExample) : storedExample,project);
    await t.test('lotes conferem checksum e rejeitam mudança numérica mesmo com hash atualizado',async () => {
      const modified = JSON.parse(rawBytes); modified.ref = '08/2026'; modified.comp.o[0] += 1;
      const payload = Buffer.from(JSON.stringify({ raw: modified,pem })), id = randomUUID();
      const split = Math.floor(payload.length / 2), chunks = [payload.subarray(0,split),payload.subarray(split)];
      await pool.query('INSERT INTO InfraCycle(id,uf,ref,imported_by,content_hash,raw_size,expected_chunks,import_status) VALUES(?,?,?,?,?,?,?,\'QUEUED\')',[id,'SP','2026-08',actorUserId,digest(payload),payload.length,chunks.length]);
      for (let seq = 0; seq < chunks.length; seq++) await pool.query('INSERT INTO InfraCycleChunk(cycle_id,seq,sha256,raw_size,data) VALUES(?,?,?,?,?)',[id,seq,digest(chunks[seq]),chunks[seq].length,chunks[seq]]);
      const held = await pool.getConnection(), lock = `infra-import-${digest(options.database).slice(0,40)}`;
      try {
        assert.equal(Number((await held.query('SELECT GET_LOCK(?,0) AS acquired',[lock]))[0].acquired),1);
        assert.equal(await processQueued(pool),null,'Another worker cannot claim a catalog while the first worker holds the lock');
        await held.query('UPDATE InfraCycle SET import_status=\'PROCESSING\',processing_at=UTC_TIMESTAMP(3) WHERE id=?',[id]);
      } finally { await held.query('SELECT RELEASE_LOCK(?)',[lock]); held.release(); }
      // Simulate process death: a persisted PROCESSING claim remains, but its
      // connection lock was released. The next cron run must retry it immediately.
      await assert.rejects(() => processQueued(pool),/Conferência recusada/);
      const denied = await pool.query('SELECT import_status FROM InfraCycle WHERE id=?',[id]); assert.equal(denied[0].import_status,'FAILED');
      const leaked = await pool.query('SELECT cycle_id FROM InfraCycleSnapshot WHERE cycle_id=?',[id]); assert.equal(leaked.length,0);
      const untouched = await pool.query('SELECT etag FROM InfraCycleSnapshot WHERE cycle_id=?',[initial.id]); assert.equal(untouched[0].etag,digest(rawBytes));
    });
    await t.test('fotografia de múltiplas UFs é recusada sem reutilizar preço do vetor estadual zero',async () => {
      const modified = JSON.parse(rawBytes); modified.ref = '09/2026'; modified.ufs = ['SP','RJ'];
      const payload = Buffer.from(JSON.stringify({ raw: modified })), id = randomUUID();
      await pool.query('INSERT INTO InfraCycle(id,uf,ref,imported_by,content_hash,raw_size,expected_chunks,import_status) VALUES(?,?,?,?,?,?,1,\'QUEUED\')',[id,'SP','2026-09',actorUserId,digest(payload),payload.length]);
      await pool.query('INSERT INTO InfraCycleChunk(cycle_id,seq,sha256,raw_size,data) VALUES(?,0,?,?,?)',[id,digest(payload),payload.length,payload]);
      await assert.rejects(() => processQueued(pool),/uma única UF/);
      const denied = await pool.query('SELECT import_status FROM InfraCycle WHERE id=?',[id]); assert.equal(denied[0].import_status,'FAILED');
      assert.equal((await pool.query('SELECT cycle_id FROM InfraCycleSnapshot WHERE cycle_id=?',[id])).length,0);
    });
  } finally {
    for (const name of tableOrder) await pool.query(`DROP TABLE IF EXISTS ${name}`).catch(() => {});
    await pool.end();
  }
});
test('conexão secundária recusa destino igual ao banco principal',() => {
  assert.throws(() => connectionOptions('mysql://user:a@localhost:3306/main','mysql://other:b@localhost/main'),/independente/);
});
test('diagnósticos do CLI não divulgam valores SQL, URLs ou trechos do JSON',() => {
  const sql = Object.assign(new Error('Duplicate entry secret-password mysql://user:secret@host/db'),{ code: 'ER_DUP_ENTRY' });
  assert.equal(safeFailure(sql),'Falha operacional no módulo Infraestrutura. Código: ER_DUP_ENTRY.');
  assert.equal(safeFailure(new SyntaxError('Unexpected token in project-private-value')),'Falha operacional no módulo Infraestrutura.');
  assert.equal(safeFailure(new InfraImportError('Conferência numérica diverge do relatório SICRO.')),'Conferência numérica diverge do relatório SICRO.');
});
test('comparação com motor original ocorre em Worker e preserva 64 serviços', { timeout: 60000 },async () => {
  const raw = JSON.parse(gunzipSync(await readFile(resolve(legacy,'base.json.gz'))));
  const pem = JSON.parse(gunzipSync(await readFile(resolve(legacy,'pem.json.gz'))));
  const project = JSON.parse(await readFile(resolve(legacy,'example-road.json'),'utf8'));
  let heartbeat = 0; const timer = setInterval(() => { heartbeat++; },10);
  const worker = new Worker(resolve(here,'../src/modules/infraestrutura/assets/migration-worker.cjs'),{ workerData: { oldRaw: raw,newRaw: raw,project,targetUf: 'SP',oldPem: pem,newPem: pem },resourceLimits: { maxOldGenerationSizeMb: 256 } });
  try {
    const reply = await new Promise((resolve,reject) => { worker.once('message',resolve); worker.once('error',reject); });
    assert.equal(reply.ok,true); assert.equal(reply.report.items.length,64); assert.equal(reply.report.before.workDays,172);
    assert.equal(reply.report.before.totals.direct,reply.report.after.totals.direct);
    assert.ok(reply.report.items.every(item => item.deltaDirectCents === 0));
    assert.ok(heartbeat > 10,'The API event loop remains responsive during the comparison');
  } finally { clearInterval(timer); await worker.terminate(); }
});

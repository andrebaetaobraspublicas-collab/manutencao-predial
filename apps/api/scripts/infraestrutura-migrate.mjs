import { config } from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectInfra, digest,InfraImportError,safeFailure } from './infraestrutura-import-lib.mjs';
config({ path: process.env.INFRA_ENV_FILE || '../../.env',override: false,quiet: true });
const migrationRoot = resolve(dirname(fileURLToPath(import.meta.url)),'../infraestrutura-migrations');
let pool;
try {
  pool = connectInfra();
  await pool.query('CREATE TABLE IF NOT EXISTS InfraMigration(name VARCHAR(200) PRIMARY KEY,sha256 CHAR(64) NOT NULL,applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  for (const name of (await readdir(migrationRoot)).filter(value => /^\d+_[a-z0-9_-]+\.sql$/.test(value)).sort()) {
    const bytes = await readFile(resolve(migrationRoot,name)), hash = digest(bytes);
    const applied = await pool.query('SELECT sha256 FROM InfraMigration WHERE name=?',[name]);
    if (applied[0]) { if (applied[0].sha256 !== hash) throw new InfraImportError('Migration aplicada foi alterada; não prosseguir.'); continue; }
    // MySQL DDL commits implicitly. A partial failure must be reconciled from the
    // migration ledger and backup; never destroy tables to make a retry succeed.
    const statements = bytes.toString('utf8').replace(/^\s*--.*$/gm,'').split(';').map(value => value.trim()).filter(Boolean);
    for (const sql of statements) await pool.query(sql);
    await pool.query('INSERT INTO InfraMigration(name,sha256) VALUES(?,?)',[name,hash]);
    console.log(`Migration independente aplicada: ${name}`);
  }
} catch (error) { console.error(safeFailure(error,'Migration Infraestrutura falhou.')); process.exitCode = 1; }
finally { if (pool) await pool.end(); }

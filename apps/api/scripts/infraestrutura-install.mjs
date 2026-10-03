#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';
import { parse } from 'dotenv';
import { databaseConfig, requireIsolatedDevelopment } from './infraestrutura-backup.mjs';
import { connectInfra, seedInfra } from './infraestrutura-import-lib.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const execute = promisify(execFile);
function args(input) {
  const values = {};
  const allowed = ['admin-email', 'admin-user-id', 'tenant-id', 'raw', 'pem', 'example', 'uf'];
  for (let index = 0; index < input.length; index++) {
    const option = input[index];
    if (['--help', '--publish', '--skip-migrate'].includes(option)) { values[option.slice(2)] = true; continue; }
    if (!option?.startsWith('--') || !allowed.includes(option.slice(2)) || !input[index + 1] || input[index + 1].startsWith('--')) throw new Error('Argumento inválido. Use --help.');
    values[option.slice(2)] = input[++index];
  }
  return values;
}

export async function install(options, env = process.env) {
  requireIsolatedDevelopment(env);
  if (!options['admin-email'] && !options['admin-user-id']) throw new Error('Informe --admin-email ou --admin-user-id de uma identidade central já existente.');
  const primaryOptions = databaseConfig(env.DATABASE_URL);
  const identity = mariadb.createPool({ ...primaryOptions, connectionLimit: 1, timezone: 'Z' });
  let account;
  try {
    const values = [options['admin-user-id'] || String(options['admin-email']).trim().toLowerCase()];
    let where = options['admin-user-id'] ? 'u.id=?' : 'u.email=?';
    if (options['tenant-id']) { where += ' AND m.tenantId=?'; values.push(options['tenant-id']); }
    const rows = await identity.query(`SELECT u.id AS userId,u.name,u.email,m.tenantId FROM User u JOIN TenantMembership m ON m.userId=u.id JOIN Tenant t ON t.id=m.tenantId WHERE ${where} AND u.status='ACTIVE' AND u.deletedAt IS NULL AND m.status='ACTIVE' AND (m.expiresAt IS NULL OR m.expiresAt>UTC_TIMESTAMP(3)) AND t.deletedAt IS NULL AND t.status IN ('TRIAL','ACTIVE','PAST_DUE') ORDER BY m.createdAt,m.id LIMIT 2`, values);
    if (rows.length !== 1) throw new Error(rows.length ? 'A conta possui mais de uma organização válida. Informe --tenant-id explicitamente.' : 'Identidade central ativa e vínculo válido não encontrados.');
    account = rows[0];
  } finally { await identity.end(); }
  if (!options['skip-migrate']) await execute(process.execPath, [join(scriptDirectory, 'infraestrutura-migrate.mjs')], { env, cwd: join(scriptDirectory, '..'), maxBuffer: 1024 * 1024 });
  const pool = connectInfra(env);
  try {
    const profileId = randomUUID();
    await pool.query("INSERT INTO InfraUser(id,external_user_id,tenant_id,name,email,role,status) VALUES(?,?,?,?,?,'ADMIN','ACTIVE') ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),role='ADMIN',status='ACTIVE',deleted_at=NULL", [profileId, account.userId, account.tenantId, account.name, account.email]);
    await pool.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?,?)', [randomUUID(), account.tenantId, account.userId, 'install.admin', 'user', account.userId, JSON.stringify({ source: 'explicit-cli', existingCentralIdentity: true })]);
    let cycle = null;
    if (options.raw) cycle = await seedInfra(pool, { rawPath: resolve(options.raw), pemPath: options.pem ? resolve(options.pem) : undefined, examplePath: options.example ? resolve(options.example) : undefined, actorUserId: account.userId, tenantId: account.tenantId, publish: options.publish === true, uf: options.uf });
    return { installed: true, centralIdentityPreserved: true, adminUserId: account.userId, tenantId: account.tenantId, cycle };
  } finally { await pool.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.INFRA_ENV_FILE) {
      const values = parse(await readFile(process.env.INFRA_ENV_FILE));
      for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
    }
    const options = args(process.argv.slice(2));
    if (options.help) {
      console.log('Uso: node infraestrutura-install.mjs --admin-email email [--tenant-id UUID] [--raw raw.json --pem pem.json --example example-road.json --uf SP --publish] [--skip-migrate]\nUsa identidade central existente; não cria/copia senhas. Destino exclusivo: novo banco de desenvolvimento INFRA_DATABASE_URL.');
    } else { console.log(JSON.stringify(await install(options), null, 2)); }
  } catch (error) {
    // MySQL errors can contain SQL values; only expose intentional CLI validation messages.
    const allowed = /^(Informe |A conta |Identidade |Argumento |Configure |INFRA_|O banco |Esta operação |WEB_BASE_URL|Banco, |Configuração MySQL)/;
    console.error(error instanceof Error && allowed.test(error.message) ? error.message : 'Falha na instalação da Infraestrutura; confira o banco privado, migrations e arquivos SICRO.');
    process.exitCode = 1;
  }
}

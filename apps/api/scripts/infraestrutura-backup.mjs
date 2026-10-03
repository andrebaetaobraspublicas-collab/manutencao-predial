#!/usr/bin/env node
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export function databaseConfig(raw) {
  if (!raw) throw new Error('Configure INFRA_DATABASE_URL para o banco exclusivo da Infraestrutura.');
  let uri;
  try { uri = new URL(raw); } catch { throw new Error('INFRA_DATABASE_URL inválida.'); }
  if (uri.protocol !== 'mysql:') throw new Error('INFRA_DATABASE_URL deve usar mysql://.');
  const database = decodeURIComponent(uri.pathname.slice(1));
  if (!/^[A-Za-z0-9_]{1,64}$/.test(database) || !uri.username || !uri.password) throw new Error('Banco, usuário e senha MySQL são obrigatórios.');
  const user = decodeURIComponent(uri.username);
  const password = decodeURIComponent(uri.password);
  if ([uri.hostname, user, password].some(value => /[\r\n\0]/.test(value))) throw new Error('Configuração MySQL contém caracteres não permitidos.');
  return { host: uri.hostname, port: Number(uri.port || 3306), user, password, database };
}

export function requireIsolatedDevelopment(env = process.env) {
  if (env.INFRA_ENABLED !== 'true') throw new Error('INFRA_ENABLED=true é obrigatório para operar o banco da Infraestrutura.');
  const config = databaseConfig(env.INFRA_DATABASE_URL);
  if (env.DATABASE_URL) {
    const original = databaseConfig(env.DATABASE_URL);
    if (original.host.toLowerCase() === config.host.toLowerCase() && original.port === config.port && original.database.toLowerCase() === config.database.toLowerCase()) throw new Error('O banco da Infraestrutura deve ser diferente do banco dos aplicativos existentes.');
  }
  if (env.WEB_BASE_URL) {
    let host;
    try { host = new URL(env.WEB_BASE_URL).hostname.toLowerCase(); } catch { throw new Error('WEB_BASE_URL inválida.'); }
    if (host === 'orcaproobras.com.br' || host.endsWith('.orcaproobras.com.br')) throw new Error('Esta operação está limitada ao ambiente de desenvolvimento.');
  }
  return config;
}

export function clientDefaults(config) {
  const quote = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `[client]\nhost=${quote(config.host)}\nport=${config.port}\nuser=${quote(config.user)}\npassword=${quote(config.password)}\ndefault-character-set=utf8mb4\n`;
}

export function privateDirectory(input) {
  if (!input || !isAbsolute(input)) throw new Error('INFRA_BACKUP_DIR deve ser um diretório privado absoluto.');
  const directory = resolve(input);
  if (/(?:^|[\\/])(?:public_html|wwwroot|public)(?:[\\/]|$)/i.test(directory)) throw new Error('Backups não podem ficar em diretório público.');
  return directory;
}

export async function pruneBackups(directory, database, now = Date.now()) {
  const cutoff = now - 14 * 24 * 60 * 60 * 1000;
  const pattern = new RegExp(`^infra-${database}-\\d{8}T\\d{9}Z-[a-f0-9]{8}\\.(?:sql\\.gz|manifest\\.json)$`);
  let removed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    const target = join(directory, entry.name);
    if ((await stat(target)).mtimeMs < cutoff) { await rm(target); removed++; }
  }
  return removed;
}

async function dumpToGzip(config, defaultsPath, partialPath, executable) {
  const args = [`--defaults-extra-file=${defaultsPath}`, '--single-transaction', '--quick', '--hex-blob', '--routines', '--triggers', '--events', '--skip-lock-tables', '--no-tablespaces', '--default-character-set=utf8mb4', config.database];
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MYSQL_PWD: '' } });
  // Error output may contain connection details; never print it or passwords.
  child.stderr.on('data', () => undefined);
  const finished = new Promise((resolveChild, rejectChild) => {
    child.once('error', () => rejectChild(new Error('Não foi possível executar mysqldump. Configure INFRA_MYSQLDUMP_BIN.')));
    child.once('close', code => code === 0 ? resolveChild() : rejectChild(new Error(`mysqldump falhou (código ${code ?? 'indisponível'}); backup não publicado.`)));
  });
  // Attach rejection handlers immediately so a spawn failure cannot become unhandled.
  try {
    await Promise.all([finished, pipeline(child.stdout, createGzip({ level: 9 }), createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }))]);
  } catch (error) { child.kill(); throw error; }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest('hex');
}

async function uploadExternal(path, url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('INFRA_BACKUP_UPLOAD_URL inválida.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Armazenamento externo exige URL HTTPS sem credencial básica.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const response = await fetch(parsed, { method: 'PUT', body: createReadStream(path), duplex: 'half', headers: { 'Content-Type': 'application/gzip', 'Content-Length': String((await stat(path)).size) }, redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error('Falha no envio do backup ao armazenamento externo.');
  } catch { throw new Error('Falha no envio do backup ao armazenamento externo; a cópia local foi preservada.'); }
  finally { clearTimeout(timeout); }
}

export async function runBackup(env = process.env) {
  const config = requireIsolatedDevelopment(env);
  const directory = privateDirectory(env.INFRA_BACKUP_DIR);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actualDirectory = privateDirectory(await realpath(directory));
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const name = `infra-${config.database}-${stamp}-${randomUUID().slice(0, 8)}`;
  const target = join(actualDirectory, `${name}.sql.gz`);
  const partial = `${target}.partial`;
  // Keep the short-lived defaults file in the user's private temp directory:
  // Windows MySQL clients do not reliably open a defaults path containing accents.
  const defaults = join(env.INFRA_MYSQL_DEFAULTS_TEMP_DIR || tmpdir(), `.infra-mysql-${randomUUID()}.cnf`);
  try {
    await writeFile(defaults, clientDefaults(config), { flag: 'wx', mode: 0o600 });
    await chmod(defaults, 0o600);
    await dumpToGzip(config, defaults, partial, env.INFRA_MYSQLDUMP_BIN || 'mysqldump');
    const bytes = (await stat(partial)).size;
    if (!bytes) throw new Error('Dump vazio; backup não publicado.');
    await rename(partial, target);
    const manifest = { format: 'orcapro-infraestrutura-mysql-gzip-v1', database: config.database, createdAt: new Date().toISOString(), bytes, sha256: await sha256File(target), retentionDays: 14 };
    await writeFile(join(actualDirectory, `${name}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    if (env.INFRA_BACKUP_UPLOAD_URL) await uploadExternal(target, env.INFRA_BACKUP_UPLOAD_URL);
    const removed = await pruneBackups(actualDirectory, config.database);
    return { backup: target, sha256: manifest.sha256, bytes, removed, externalUpload: Boolean(env.INFRA_BACKUP_UPLOAD_URL) };
  } finally {
    await rm(defaults, { force: true });
    await rm(partial, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.INFRA_ENV_FILE) {
    const { parse } = await import('dotenv');
    const values = parse(await readFile(process.env.INFRA_ENV_FILE));
    for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
  }
  try { console.log(JSON.stringify(await runBackup(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Falha no backup da Infraestrutura.'); process.exitCode = 1; }
}

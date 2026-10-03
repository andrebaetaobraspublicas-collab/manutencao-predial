import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORMAT = 'orcapro-deployment-mirror-1';
const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');

export function quoteIdentifier(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Invalid database identifier.');
  return '`' + value.replaceAll('`', '``') + '`';
}

export function rowDigest(rows) {
  const digest = createHash('sha256');
  for (const row of rows) digest.update(JSON.stringify(row.map(value => value === null ? null : String(value))) + '\n');
  return digest.digest('hex');
}

export async function scanPrivateFiles(uploadRoot) {
  const root = resolve(uploadRoot);
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory);
    entries.sort();
    for (const name of entries) {
      const path = join(directory, name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error('Private uploads contain a symbolic link; audit it before copying.');
      if (stat.isDirectory()) { await visit(path); continue; }
      if (!stat.isFile()) throw new Error('Private uploads contain an unsupported filesystem entry.');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      files.push({ key: relative(root, path).split(sep).join('/'), size: String(stat.size), sha256: hash.digest('hex') });
    }
  }
  await visit(root);
  return files.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export function compareMirrors(source, target) {
  if (source.format !== FORMAT || target.format !== FORMAT) throw new Error('Unsupported deployment manifest format.');
  const differences = [];
  const sourceTables = new Map(source.tables.map(table => [table.name, table]));
  const targetTables = new Map(target.tables.map(table => [table.name, table]));
  for (const name of new Set([...sourceTables.keys(), ...targetTables.keys()])) {
    const a = sourceTables.get(name), b = targetTables.get(name);
    if (!a || !b) { differences.push(`Table missing in one database: ${name}`); continue; }
    if (a.schemaSha256 !== b.schemaSha256 || JSON.stringify(a.columns) !== JSON.stringify(b.columns)) differences.push(`Table schema differs: ${name}`);
    if (a.rowCount !== b.rowCount || a.rowsSha256 !== b.rowsSha256) differences.push(`Table records differ: ${name}`);
  }
  for (const [label, snapshot] of [['source', source], ['target', target]]) {
    for (const constraint of snapshot.foreignKeys) {
      if (constraint.orphans !== '0') differences.push(`Foreign key has orphan records in ${label}: ${constraint.table}.${constraint.name}`);
    }
  }
  const withoutCounts = list => list.map(({ orphans: _orphans, ...constraint }) => constraint);
  if (JSON.stringify(withoutCounts(source.foreignKeys)) !== JSON.stringify(withoutCounts(target.foreignKeys))) differences.push('Foreign key definitions differ.');
  if (JSON.stringify(source.files) !== JSON.stringify(target.files)) differences.push('Private upload keys, sizes or hashes differ.');
  return { status: differences.length ? 'different' : 'identical', tables: source.tables.length, files: source.files.length, differences };
}

async function capture(options) {
  const configuredUrl = process.env.ORCAPRO_SNAPSHOT_DATABASE_URL || process.env.DATABASE_URL;
  if (!configuredUrl) throw new Error('Set ORCAPRO_SNAPSHOT_DATABASE_URL or DATABASE_URL through the private environment.');
  let url;
  try { url = new URL(configuredUrl); } catch { throw new Error('The private database configuration is not a valid URL.'); }
  if (url.protocol !== 'mysql:' || !url.username || !url.password || !/^\/[^/]+$/.test(url.pathname)) throw new Error('The private configuration must identify one MySQL database.');
  const schema = decodeURIComponent(url.pathname.slice(1));
  const require = createRequire(join(resolve(options.runtimeRoot || join(here, '..')), 'package.json'));
  const mariadb = require('mariadb');
  const connection = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || '3306'),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: schema,
    charset: 'utf8mb4',
    dateStrings: true,
    bigIntAsNumber: false,
    decimalAsNumber: false,
    multipleStatements: false,
    connectTimeout: 20_000,
    queryTimeout: 0,
  });
  try {
    await connection.query("SET time_zone = '+00:00'");
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const tables = [];
    const definitions = await connection.query('SELECT TABLE_NAME name, TABLE_TYPE type FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [schema]);
    if (!definitions.length) throw new Error('The selected database has no tables.');
    for (const definition of definitions) {
      const name = definition.name;
      if (definition.type !== 'BASE TABLE') throw new Error('This schema has views; include an audited view migration before verifying the mirror.');
      const columns = await connection.query('SELECT COLUMN_NAME name, COLUMN_TYPE type, IS_NULLABLE nullable, CHARACTER_SET_NAME charset, COLLATION_NAME collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [schema, name]);
      const primary = await connection.query("SELECT COLUMN_NAME name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [schema, name]);
      if (!primary.length) throw new Error('Every mirrored table must have a primary key for deterministic record verification.');
      const createRows = await connection.query(`SHOW CREATE TABLE ${quoteIdentifier(name)}`);
      const createSql = String(createRows[0]['Create Table']).replaceAll(quoteIdentifier(schema) + '.', '`<current>`.' );
      const selected = columns.map(column => `HEX(CAST(${quoteIdentifier(column.name)} AS BINARY))`).join(',');
      const ordered = primary.map(column => quoteIdentifier(column.name)).join(',');
      const hash = createHash('sha256');
      let count = 0n;
      const stream = connection.queryStream({ sql: `SELECT ${selected} FROM ${quoteIdentifier(name)} ORDER BY ${ordered}`, rowsAsArray: true });
      for await (const row of stream) {
        hash.update(JSON.stringify(row.map(value => value === null ? null : String(value))) + '\n');
        count += 1n;
      }
      tables.push({ name, columns: columns.map(column => ({ ...column })), schemaSha256: sha(createSql), rowCount: String(count), rowsSha256: hash.digest('hex') });
    }
    const foreignKeyRows = await connection.query('SELECT TABLE_NAME tableName, CONSTRAINT_NAME constraintName, COLUMN_NAME columnName, REFERENCED_TABLE_SCHEMA referencedSchema, REFERENCED_TABLE_NAME referencedTable, REFERENCED_COLUMN_NAME referencedColumn FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION', [schema]);
    const grouped = new Map();
    for (const row of foreignKeyRows) {
      if (row.referencedSchema !== schema) throw new Error('A foreign key points outside the selected database; the target must be isolated.');
      const key = `${row.tableName}\0${row.constraintName}`;
      if (!grouped.has(key)) grouped.set(key, { table: row.tableName, name: row.constraintName, referencedTable: row.referencedTable, columns: [] });
      grouped.get(key).columns.push({ local: row.columnName, reference: row.referencedColumn });
    }
    const foreignKeys = [];
    for (const constraint of grouped.values()) {
      const pair = constraint.columns.map(column => `child.${quoteIdentifier(column.local)} = parent.${quoteIdentifier(column.reference)}`).join(' AND ');
      const populated = constraint.columns.map(column => `child.${quoteIdentifier(column.local)} IS NOT NULL`).join(' AND ');
      const rows = await connection.query(`SELECT COUNT(*) orphans FROM ${quoteIdentifier(constraint.table)} child LEFT JOIN ${quoteIdentifier(constraint.referencedTable)} parent ON ${pair} WHERE ${populated} AND parent.${quoteIdentifier(constraint.columns[0].reference)} IS NULL`);
      foreignKeys.push({ ...constraint, orphans: String(rows[0].orphans) });
    }
    await connection.query('COMMIT');
    const files = await scanPrivateFiles(options.uploads);
    const manifest = { format: FORMAT, createdAtUtc: new Date().toISOString(), database: schema, tables, foreignKeys, files };
    await writeFile(resolve(options.output), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ status: 'captured', tables: tables.length, files: files.length, manifest: resolve(options.output) }));
  } finally { await connection.end(); }
}

async function main(args) {
  if (args[0] === 'compare' && args.length === 3) {
    const result = compareMirrors(JSON.parse(await readFile(resolve(args[1]), 'utf8')), JSON.parse(await readFile(resolve(args[2]), 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'identical') process.exitCode = 1;
    return;
  }
  if (args[0] !== 'capture') throw new Error('Usage: capture --output <private.json> --uploads <private-folder> [--runtime-root <app-root>] | compare <source.json> <target.json>');
  const options = {};
  const allowed = { '--output': 'output', '--uploads': 'uploads', '--runtime-root': 'runtimeRoot' };
  for (let i = 1; i < args.length; i += 2) {
    const name = allowed[args[i]];
    if (!name || !args[i + 1] || options[name]) throw new Error('Invalid snapshot argument.');
    options[name] = args[i + 1];
  }
  if (!options.output || !options.uploads) throw new Error('Capture requires a private output file and the private uploads directory.');
  await capture(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // Database driver errors may include credentials or personal values. Output
    // only an audited application error or a technical error code.
    const safeMessages = /^(Set ORCAPRO_|The private |The selected |This schema |Every mirrored |A foreign key |Private uploads |Capture requires |Invalid snapshot |Usage:|Unsupported deployment)/;
    console.error(safeMessages.test(error?.message || '') ? error.message : `Mirror verification failed${/^[A-Z0-9_]+$/.test(error?.code || '') ? ' (' + error.code + ')' : ''}.`);
    process.exitCode = 1;
  });
}

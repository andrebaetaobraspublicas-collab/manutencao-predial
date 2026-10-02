import { BadRequestException } from '@nestjs/common';
import { TransformStream } from 'node:stream/web';
import type { LegacyRuntime } from './legacy/legacy-runtime';

export const XLSX_LIMITS = { compressed: 40 * 1024 * 1024, expanded: 256 * 1024 * 1024, entry: 96 * 1024 * 1024, entries: 2048, ratio: 250, milliseconds: 120000 };

/** Inspect ZIP metadata before allowing the preserved parser to decompress anything. */
export function validateXlsxZip(buffer: Buffer): void {
  const fail = () => { throw new BadRequestException('XLSX inválido ou excede os limites seguros de descompressão.'); };
  if (buffer.length < 22 || buffer.length > XLSX_LIMITS.compressed) fail();
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0,buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0 || end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) fail();
  const count = buffer.readUInt16LE(end + 10), bytes = buffer.readUInt32LE(end + 12), start = buffer.readUInt32LE(end + 16);
  if (!count || count > XLSX_LIMITS.entries || count !== buffer.readUInt16LE(end + 8) || start + bytes > end) fail();
  const names = new Set<string>(); let position = start, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > start + bytes || buffer.readUInt32LE(position) !== 0x02014b50) fail();
    const flags = buffer.readUInt16LE(position + 8), method = buffer.readUInt16LE(position + 10), compressed = buffer.readUInt32LE(position + 20), size = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28), extra = buffer.readUInt16LE(position + 30), comment = buffer.readUInt16LE(position + 32), local = buffer.readUInt32LE(position + 42);
    if (position + 46 + nameLength + extra + comment > start + bytes || flags & 1 || ![0,8].includes(method) || size > XLSX_LIMITS.entry || compressed === 0xffffffff || size === 0xffffffff || local + 30 > start) fail();
    const name = buffer.subarray(position + 46,position + 46 + nameLength).toString('utf8');
    if (!name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(segment => segment === '..' || segment === '.') || names.has(name)) fail();
    names.add(name);
    if (buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 8) !== method || buffer.readUInt16LE(local + 6) & 1) fail();
    const localName = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28);
    if (local + 30 + localName + localExtra + compressed > start || buffer.subarray(local + 30,local + 30 + localName).toString('utf8') !== name) fail();
    expanded += size;
    if (expanded > XLSX_LIMITS.expanded || (size > 1024 * 1024 && size > Math.max(1,compressed) * XLSX_LIMITS.ratio)) fail();
    position += 46 + nameLength + extra + comment;
  }
  if (position !== start + bytes || !names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) fail();
}

/** Also enforce actual decoded bytes: declared usize alone is not trusted. */
export function protectLegacyXlsx(runtime: LegacyRuntime, buffer: Buffer): void {
  validateXlsxZip(buffer);
  const original = runtime.OP.xlsx.entryStream;
  const started = Date.now(); let total = 0;
  runtime.OP.xlsx.entryStream = async function (zip: { entries: Map<string,{usize:number}> }, name: string) {
    const stream = await original(zip,name);
    const declared = zip.entries.get(name)?.usize ?? 0; let entryBytes = 0;
    return stream.pipeThrough(new TransformStream<string,string>({
      transform(chunk,controller) {
        const bytes = Buffer.byteLength(chunk,'utf8'); entryBytes += bytes; total += bytes;
        if (entryBytes > declared + 1024 || entryBytes > XLSX_LIMITS.entry || total > XLSX_LIMITS.expanded || Date.now() - started > XLSX_LIMITS.milliseconds) throw new BadRequestException('Limite de processamento/descompressão do XLSX excedido.');
        controller.enqueue(chunk);
      },
    }));
  };
}

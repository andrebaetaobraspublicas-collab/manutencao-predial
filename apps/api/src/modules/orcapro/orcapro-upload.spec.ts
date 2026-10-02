import { loadLegacyRuntime } from './legacy/legacy-runtime';
import { protectLegacyXlsx, validateXlsxZip } from './orcapro-upload';

describe('OrçaPro XLSX safety boundary',() => {
  const archive = async (extra: string = '') => Buffer.from(await loadLegacyRuntime().OP.xlsx.zipStore([
    { name: '[Content_Types].xml',data: '<Types/>' },{ name: 'xl/workbook.xml',data: '<workbook/>' },...(extra ? [{ name: extra,data: 'data' }] : []),
  ]).arrayBuffer());
  it('accepts the original engine ZIP writer and rejects malformed/path-traversal archives',async () => {
    const valid = await archive(), escaped = await archive('../escaped.xml');
    expect(() => validateXlsxZip(valid)).not.toThrow();
    expect(() => validateXlsxZip(Buffer.from('invalid'))).toThrow();
    expect(() => validateXlsxZip(escaped)).toThrow();
  });
  it('rejects encrypted, unsupported and declared excessive expanded entries',async () => {
    const signature = Buffer.from([0x50,0x4b,0x01,0x02]);
    const encrypted = await archive(), e = encrypted.indexOf(signature); encrypted.writeUInt16LE(1,e + 8);
    expect(() => validateXlsxZip(encrypted)).toThrow();
    const large = await archive(), l = large.indexOf(signature); large.writeUInt32LE(0xffffffff,l + 24);
    expect(() => validateXlsxZip(large)).toThrow();
  });
  it('checks actual bytes, including a lying declared uncompressed size',async () => {
    const buffer = await archive(); const runtime = loadLegacyRuntime();
    runtime.OP.xlsx.entryStream = async () => new ReadableStream<string>({ start(controller) { controller.enqueue('X'.repeat(2048)); controller.close(); } });
    protectLegacyXlsx(runtime,buffer);
    const stream = await runtime.OP.xlsx.entryStream({ entries: new Map([['x',{usize: 1}]]) },'x');
    await expect(stream.getReader().read()).rejects.toThrow('descompressão');
  });
});

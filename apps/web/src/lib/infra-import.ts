import { infraApi } from './infra-api';

export type CatalogBundle = { raw: { ref: string; ufs: string[]; comp: { c: unknown[] }; ins: { c: unknown[] } }; pem?: unknown };
export async function uploadInfraCatalog(bundle: CatalogBundle, uf: string, ref: string, files: string[], progress: (message: string) => void) {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  if (!bytes.length || bytes.length > 40 * 1024 * 1024) throw new Error('O catálogo excede o limite de 40 MB.');
  const hash = async (data: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)), b => b.toString(16).padStart(2, '0')).join('');
  const size = 512 * 1024, expectedChunks = Math.ceil(bytes.length / size);
  const cycle = await infraApi<{ id: string }>('/admin/cycles', { method: 'POST', body: JSON.stringify({ uf, ref, expectedChunks, expectedBytes: bytes.length, contentHash: await hash(bytes), files }) });
  for (let index = 0; index < expectedChunks; index++) {
    const fragment = bytes.slice(index * size, (index + 1) * size);
    let transmitted = fragment, encoding = 'utf8';
    if (typeof CompressionStream !== 'undefined') {
      const stream = new Blob([fragment.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream('gzip'));
      transmitted = new Uint8Array(await new Response(stream).arrayBuffer()); encoding = 'gzip';
    }
    let binary = ''; for (let start = 0; start < transmitted.length; start += 8192) binary += String.fromCharCode(...transmitted.subarray(start, start + 8192));
    progress(`Enviando lote ${index + 1} de ${expectedChunks}…`);
    await infraApi(`/admin/cycles/${cycle.id}/chunks`, { method: 'POST', body: JSON.stringify({ index, dataBase64: btoa(binary), sha256: await hash(fragment), encoding }) });
  }
  await infraApi(`/admin/cycles/${cycle.id}/finalize`, { method: 'POST' });
  progress('Arquivos recebidos. A conferência completa será executada pelo servidor; atualize a lista para acompanhar.');
  return cycle.id;
}

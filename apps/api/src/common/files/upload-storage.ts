import path from 'node:path';
import iconv from 'iconv-lite';

const MOJIBAKE_MARKERS = /(?:Ã.|Â.|â.|ð.|�)/u;

export function sanitizeUploadOriginalName(originalName: string): string {
  const basename = path.basename(originalName.replaceAll('\\', '/'));
  let recovered = basename;
  for (let pass = 0; pass < 4 && MOJIBAKE_MARKERS.test(recovered); pass += 1) {
    const decoded = iconv.decode(iconv.encode(recovered, 'windows-1252'), 'utf8');
    if (decoded.includes('\uFFFD') || decoded === recovered) break;
    recovered = decoded;
  }

  return recovered
    .normalize('NFC')
    .replace(/[\r\n\0]/g, '_')
    .slice(0, 255);
}

export function resolveUploadRoot(configuredRoot?: string, cwd = process.cwd()): string {
  if (configuredRoot && path.isAbsolute(configuredRoot)) return path.resolve(configuredRoot);

  const normalizedCwd = path.resolve(cwd);
  const buildsSegment = `${path.sep}.builds${path.sep}`;
  const buildsIndex = normalizedCwd.indexOf(buildsSegment);
  if (buildsIndex >= 0) {
    const domainRoot = normalizedCwd.slice(0, buildsIndex);
    return path.join(domainRoot, 'storage', 'uploads');
  }

  return path.resolve(cwd, configuredRoot || './uploads');
}

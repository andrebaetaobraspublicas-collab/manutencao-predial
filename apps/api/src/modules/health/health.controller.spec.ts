import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveReleaseSha } from './health.controller';

describe('resolveReleaseSha', () => {
  const originalRelease = process.env.RELEASE_SHA;

  afterEach(() => {
    if (originalRelease === undefined) delete process.env.RELEASE_SHA;
    else process.env.RELEASE_SHA = originalRelease;
  });

  it('prioriza o SHA informado pelo ambiente', () => {
    process.env.RELEASE_SHA = `  ${'a'.repeat(44)}  `;
    expect(resolveReleaseSha('arquivo-inexistente')).toBe('a'.repeat(40));
  });

  it('lê o SHA materializado no artefato', () => {
    delete process.env.RELEASE_SHA;
    const directory = mkdtempSync(join(tmpdir(), 'gp-release-'));
    const releaseFile = join(directory, 'release-sha.txt');

    try {
      writeFileSync(releaseFile, `${'b'.repeat(40)}\n`, 'utf8');
      expect(resolveReleaseSha(releaseFile)).toBe('b'.repeat(40));
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('retorna unknown quando não há marcador', () => {
    delete process.env.RELEASE_SHA;
    expect(resolveReleaseSha('arquivo-inexistente')).toBe('unknown');
  });
});

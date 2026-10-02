import * as path from 'node:path';

/** The preserved source is dynamic JavaScript. This boundary keeps its document
 * shape intact; HTTP DTO validation and tenant authorization belong to callers. */
export type LegacyRecord = Record<string, any>;

export interface LegacyCalculation {
  /** Independent copy, including the original periodic-quantity derivations. */
  project: LegacyRecord;
  base: LegacyRecord;
  model: LegacyRecord;
}

export interface LegacyRuntime {
  OP: LegacyRecord;
  manifest: {
    version: string;
    sourceSha256: string;
    clockForFixtures: string;
    modules: Array<{ file: string; sha256: string }>;
  };
  createBase(
    raw: LegacyRecord,
    referenceId?: string,
    inputs?: LegacyRecord[],
    compositions?: LegacyRecord[],
    quotes?: LegacyRecord[],
  ): LegacyRecord;
  calculateProject(
    raw: LegacyRecord,
    project: LegacyRecord,
    options?: { referenceId?: string },
  ): LegacyCalculation;
  buildExample(key: 'demo' | 'edificio', raw: LegacyRecord): LegacyRecord;
  summarizeProject(
    raw: LegacyRecord,
    project: LegacyRecord,
    options?: { referenceId?: string },
  ): LegacyRecord;
}

/** Create an isolated runtime per calculation/request. Do not keep a global
 * instance: the original IVA/BDI bridges contain project-scoped mutable state.
 * This loads only installed, checksum-verified source assets. Never pass an
 * uploaded directory or JavaScript as assetsDirectory. */
export function loadLegacyRuntime(
  options: { assetsDirectory?: string; nowISO?: string } = {},
): LegacyRuntime {
  const assetsDirectory = options.assetsDirectory || path.join(__dirname, 'assets');
  // Kept as a JS asset so the original modules never undergo TS transpilation.
  const implementation = require(path.join(assetsDirectory, 'runtime.cjs')) as {
    loadLegacyRuntime: (settings: typeof options) => LegacyRuntime;
  };
  return implementation.loadLegacyRuntime({ ...options, assetsDirectory });
}

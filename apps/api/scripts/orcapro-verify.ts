import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrcaproService } from '../src/modules/orcapro/orcapro.service';
import { OrcaproAccess } from '../src/modules/orcapro/orcapro.guard';
import { JsonRecord, projectOfficialCodes, validateProjectData } from '../src/modules/orcapro/orcapro-domain';
import { loadLegacyRuntime } from '../src/modules/orcapro/legacy/legacy-runtime';

// Read-only verification of normalized MySQL data and sparse graph hydration.
async function main() {
  const prisma = new PrismaService();
  try {
    const ref = await prisma.orcaproReference.findUnique({ where: { year_month_revision: { year: 2026,month: 8,revision: 1 } } });
    if (!ref || ref.status !== 'PUBLISHED') throw new Error('Seed SINAPI 08/2026 revisão1 não encontrado/publicado.');
    const root = resolve(__dirname,'../../../legacy/orcaplan-1.8.3');
    const baseline = JSON.parse(readFileSync(resolve(root,'fixtures/baseline.json'),'utf8'));
    const service = new OrcaproService(prisma,new OrcaproAccess(new ConfigService(process.env),prisma));
    for (const key of ['demo','edificio']) {
      const project = validateProjectData(JSON.parse(readFileSync(resolve(root,`fixtures/${key}.project.json`),'utf8')));
      const codes = projectOfficialCodes(project);
      const graph = await service.graph(ref.id,codes.compositions,codes.inputs,String(project.uf),String(project.rg) as 'SD'|'CD'|'SE',prisma,false,new Set(codes.optional));
      const result = loadLegacyRuntime({ nowISO: baseline.clock }).summarizeProject(graph.raw,project,{ referenceId: ref.id });
      if (!isDeepStrictEqual(result,baseline.examples[key])) {
        const changed = Object.keys(result).filter(field => !isDeepStrictEqual(result[field],baseline.examples[key][field]));
        throw new Error(`${key}: diferenças nos campos ${changed.join(', ')}`);
      }
      console.log(JSON.stringify({ example: key,match: true,hydratedInputs: graph.inputs.length,hydratedCompositions: graph.compositions.length,historicalFixedCodes: graph.historicalFixedCodes,globalCatalogueCopied: false }));
    }
  } finally { await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na regressão MySQL.'); process.exitCode = 1; });

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrcaproService } from '../src/modules/orcapro/orcapro.service';
import { OrcaproAccess } from '../src/modules/orcapro/orcapro.guard';
import { JsonRecord, validateProjectData, validateRawSinapi } from '../src/modules/orcapro/orcapro-domain';
import { Prisma } from '../src/generated/prisma/client';
import type { AuthenticatedUser } from '../src/common/types/authenticated-user';

// Deliberately separate from prisma/seed.ts; an explicit opt-in deployment wrapper may invoke this CLI.
async function main() {
  if (!process.argv.includes('--confirm-orcapro-seed')) throw new Error('Use --confirm-orcapro-seed para importar somente as tabelas OrçaPro no DATABASE_URL selecionado.');
  const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const adminId = arg('admin-user-id') ?? process.env.ORCAPRO_SEED_ADMIN_USER_ID;
  const adminEmail = arg('admin-email');
  if (!adminId && !adminEmail) throw new Error('Informe --admin-user-id=<UUID> ou --admin-email=<email existente>. Nenhuma conta/senha será criada.');
  const prisma = new PrismaService();
  try {
    const membership = await prisma.tenantMembership.findFirst({ where: { ...(adminId ? { userId: adminId } : { user: { email: adminEmail } }), status: 'ACTIVE', user: { ...(adminEmail ? { email: adminEmail } : {}), status: 'ACTIVE', deletedAt: null }, tenant: { deletedAt: null, status: { in: ['TRIAL','ACTIVE','PAST_DUE'] } } }, include: { user: true, tenant: true } });
    if (!membership) throw new Error('Administrador existente/ativo com membership não encontrado. Use o convite/reset seguro da plataforma antes de habilitar OrçaPro.');
    const actor: AuthenticatedUser = { userId: membership.userId, tenantId: membership.tenantId, membershipId: membership.id, tenantSlug: membership.tenant.slug, role: membership.role, email: membership.user.email, name: membership.user.name };
    const config = new ConfigService({ ...process.env, ORCAPRO_ADMIN_USER_IDS: actor.userId });
    const service = new OrcaproService(prisma, new OrcaproAccess(config, prisma));
    const fixtureRoot = resolve(arg('assets') ?? resolve(__dirname, '../../../legacy/orcaplan-1.8.3'));
    const raw = validateRawSinapi(JSON.parse(readFileSync(resolve(fixtureRoot,'sinapi-2026-08.raw.json'),'utf8')));
    const checksum = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
    const [month, year] = raw.ref.split('/').map(Number), revision = Number(arg('revision') ?? 1);
    let ref = await prisma.orcaproReference.findUnique({ where: { year_month_revision: { year, month, revision } } });
    if (ref && ref.sourceChecksum !== checksum) throw new Error('Referência existente com checksum diferente. Escolha outra revisão; referências anteriores serão preservadas.');
    if (!ref) ref = (await service.importSinapi(actor, { raw, sourceName: 'OrçaPlan 1.8.3 catálogo incorporado', revision })).reference;
    if (ref.status === 'DRAFT') { await service.validateReference(actor, ref.id); ref = (await prisma.orcaproReference.findUnique({ where: { id: ref.id } }))!; }
    if (ref.status === 'VALIDATED') { await service.publishReference(actor, ref.id); ref = (await prisma.orcaproReference.findUnique({ where: { id: ref.id } }))!; }
    if (ref.status !== 'PUBLISHED') throw new Error('Seed inicial exige referência publicada.');
    const settings = await prisma.orcaproSettings.findUnique({ where: { id: 'global' } });
    if (!settings?.defaultReferenceId) await service.defaultReference(actor, ref.id);
    for (const [key, code] of [['demo','DEMO_SMALL'],['edificio','EDIFICIO_4_PAVIMENTOS']] as const) {
      const fixture = validateProjectData(JSON.parse(readFileSync(resolve(fixtureRoot,`fixtures/${key}.project.json`),'utf8')));
      const canonical = { ...fixture, sinapiReferenceId: ref.id };
      await prisma.orcaproTemplate.upsert({ where: { code }, update: {}, create: { code, name: String(fixture.name).slice(0,160), referenceId: ref.id, uf: String(fixture.uf), regime: String(fixture.rg) as 'SD'|'CD'|'SE', data: canonical as Prisma.InputJsonValue, isPublic: true } });
    }
    console.log(JSON.stringify({ seeded: true, reference: ref.label, inputs: raw.ins.c.length, compositions: raw.comp.c.length, templates: 2, maintenanceChanged: false, adminConfiguration: 'ORCAPRO_ADMIN_USER_IDS deve conter o UUID da conta existente autorizada; o seed não altera papéis de manutenção.' }));
  } finally { await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha no seed OrçaPro.'); process.exitCode = 1; });

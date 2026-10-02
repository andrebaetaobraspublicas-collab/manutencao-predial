import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, OrcaproReferenceStatus, type OrcaproProject } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcaproAccess } from './orcapro.guard';
import { AdaptCompositionDto, AdminListQuery, CatalogQuery, CloneTemplateDto, CreateProjectDto, ImportSinapiDto, SaveProjectDto } from './orcapro.dto';
import { AnalyticNode, assertContext, calculateAnalyticCosts, centsToAmount, JsonRecord, mulTrunc, officialCode, ORCAPRO_ENGINE_VERSION, projectOfficialCodes, RawSinapi, REGIMES, scaledDecimal, validateProjectData, validateRawSinapi } from './orcapro-domain';
import { loadLegacyRuntime } from './legacy/legacy-runtime';
import { protectLegacyXlsx } from './orcapro-upload';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const stableJson = (value: unknown): string => JSON.stringify(value, function (_key, current) {
  return current && typeof current === 'object' && !Array.isArray(current) ? Object.fromEntries(Object.keys(current).sort().map(key => [key,current[key]])) : current;
});
type Db = Prisma.TransactionClient;
const batch = async <T>(items: T[], save: (rows: T[]) => Promise<unknown>, size = 700) => {
  for (let i = 0; i < items.length; i += size) await save(items.slice(i, i + size));
};
const readable = [OrcaproReferenceStatus.PUBLISHED, OrcaproReferenceStatus.ARCHIVED];

@Injectable()
export class OrcaproService {
  constructor(private readonly prisma: PrismaService, private readonly access: OrcaproAccess) {}
  private owner(user: AuthenticatedUser) { return { tenantId: user.tenantId, ownerUserId: user.userId }; }
  private audit(db: Db, user: AuthenticatedUser, action: string, entityId: string, metadata?: unknown) {
    return db.orcaproAudit.create({ data: { actorUserId: user.userId, tenantId: user.tenantId, action, entityId, ...(metadata === undefined ? {} : { metadata: json(metadata) }) } });
  }
  async reference(id: string, db: Db = this.prisma, allowDraft = false) {
    const ref = await db.orcaproReference.findFirst({ where: { id, ...(allowDraft ? {} : { status: { in: readable }, publishedAt: { not: null } }) } });
    if (!ref) throw new NotFoundException('Referência SINAPI não disponível.');
    return ref;
  }
  async references(user: AuthenticatedUser, admin = false) {
    if (admin) this.access.assertAdmin(user);
    const [items, settings] = await Promise.all([
      this.prisma.orcaproReference.findMany({ where: admin ? {} : { status: { in: readable }, publishedAt: { not: null } }, orderBy: [{ year: 'desc' },{ month: 'desc' },{ revision: 'desc' }], take: 300,
        select: { id: true, year: true, month: true, revision: true, label: true, status: true, createdAt: true, publishedAt: true, validation: true } }),
      this.prisma.orcaproSettings.findUnique({ where: { id: 'global' } }),
    ]);
    return { items, defaultReferenceId: settings?.defaultReferenceId ?? null };
  }

  async catalogInputs(query: CatalogQuery) {
    assertContext(query.uf, query.regime); await this.reference(query.referenceId);
    const where: Prisma.OrcaproInputVersionWhereInput = { referenceId: query.referenceId,
      ...(query.nature ? { nature: query.nature } : {}),
      ...(query.search?.trim() ? { OR: [{ description: { contains: query.search.trim() } }, { input: { code: { startsWith: query.search.trim() } } }] } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.orcaproInputVersion.findMany({ where, include: { input: { include: { prices: { where: { referenceId: query.referenceId, regime: query.regime, uf: { in: [query.uf,'SP'] } } } } } }, orderBy: { input: { code: 'asc' } }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.orcaproInputVersion.count({ where }),
    ]);
    return { items: rows.map(row => {
      const exact = row.input.prices.find(p => p.uf === query.uf);
      const chosen = exact?.amount != null ? exact : row.input.prices.find(p => p.uf === 'SP' && p.amount != null);
      return { id: row.inputId, versionId: row.id, code: row.input.code, description: row.description, unit: row.unit, nature: row.nature, origin: 'SINAPI', referenceId: row.referenceId, uf: query.uf, regime: query.regime,
        price: chosen?.amount?.toFixed(6) ?? null, priceCents: chosen?.amount ? scaledDecimal(chosen.amount.toFixed(6), 2, true).toString() : null, priceUf: chosen?.uf ?? null, attributedToSP: !!chosen && chosen.uf !== query.uf, missingPrice: !chosen };
    }), total, page: query.page, pageSize: query.pageSize };
  }
  async catalogCompositions(query: CatalogQuery) {
    assertContext(query.uf, query.regime); await this.reference(query.referenceId);
    const where: Prisma.OrcaproCompositionVersionWhereInput = { referenceId: query.referenceId,
      ...(query.group ? { group: query.group } : {}),
      ...(query.search?.trim() ? { OR: [{ description: { contains: query.search.trim() } }, { composition: { code: { startsWith: query.search.trim() } } }, { group: { contains: query.search.trim() } }] } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.orcaproCompositionVersion.findMany({ where, include: { composition: true }, orderBy: { composition: { code: 'asc' } }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.orcaproCompositionVersion.count({ where }),
    ]);
    const bundle = await this.graph(query.referenceId, rows.map(r => r.composition.code), [], query.uf, query.regime);
    return { items: rows.map(row => ({ id: row.compositionId, versionId: row.id, code: row.composition.code, description: row.description, unit: row.unit, group: row.group, origin: 'SINAPI', referenceId: row.referenceId,
      ...this.cost(bundle, row.composition.code) })), total, page: query.page, pageSize: query.pageSize };
  }
  private cost(graph: Awaited<ReturnType<OrcaproService['graph']>>, code: string) {
    const cents = graph.costs.get(code) ?? null;
    const seen = new Set<string>(), inputs = new Set<string>(), pending = [code];
    const byCode = new Map(graph.compositions.map(c => [c.composition.code,c]));
    while (pending.length) {
      const next = pending.pop()!; if (seen.has(next)) continue; seen.add(next);
      for (const item of byCode.get(next)?.items ?? []) {
        if (item.input) inputs.add(item.input.code); else if (item.childComposition) pending.push(item.childComposition.code);
      }
    }
    const fallbackInputs = graph.fallbackInputs.filter(input => inputs.has(input));
    return { uf: graph.uf, regime: graph.regime, cost: cents == null ? null : centsToAmount(cents), costCents: cents?.toString() ?? null, attributedToSP: fallbackInputs.length > 0, fallbackInputs, missingPrice: cents == null };
  }
  async composition(code: string, referenceId: string, uf: string, regime: 'SD'|'CD'|'SE') {
    officialCode(code);
    const graph = await this.graph(referenceId, [code], [], uf, regime);
    const row = graph.compositions.find(c => c.composition.code === code);
    if (!row) throw new NotFoundException('Composição SINAPI ausente nesta referência.');
    return { id: row.compositionId, versionId: row.id, code, description: row.description, unit: row.unit, group: row.group, referenceId, origin: 'SINAPI',
      ...this.cost(graph, code), items: row.items.map(i => {
        const childCode = i.input?.code ?? i.childComposition!.code;
        const detail = i.inputId ? graph.inputs.find(input => input.inputId === i.inputId) : graph.compositions.find(c => c.compositionId === i.childCompositionId);
        const price = (i.inputId ? graph.prices.get(childCode) : graph.costs.get(childCode)) ?? null;
        const subtotal = i.coefficient.isZero() ? 0n : price == null ? null : mulTrunc(i.coefficient.toFixed(12), price);
        return { type: i.inputId ? 'I' : 'C', code: childCode, coefficient: i.coefficient.toFixed(12), description: detail?.description ?? '', unit: detail?.unit ?? '', price: price == null ? null : centsToAmount(price), priceCents: price?.toString() ?? null, subtotal: subtotal == null ? null : centsToAmount(subtotal), subtotalCents: subtotal?.toString() ?? null };
      }) };
  }

  /** Hydrate only the requested transitive analytic graph. The global catalogue never becomes a private snapshot. */
  async graph(referenceId: string, roots: string[], rootInputs: string[], uf: string, regime: 'SD'|'CD'|'SE', db: Db = this.prisma, allowDraft = false, optionalRoots = new Set<string>()) {
    assertContext(uf, regime);
    const ref = await this.reference(referenceId, db, allowDraft);
    const metadata = ref.metadata as JsonRecord;
    const ufs = metadata.ufs as string[];
    if (!ufs?.includes(uf)) throw new BadRequestException('UF não importada nesta referência.');
    const done = new Set<string>(), wanted = new Set(rootInputs), pending = [...new Set(roots)];
    type Row = Prisma.OrcaproCompositionVersionGetPayload<{ include: { composition: true; items: { include: { input: true; childComposition: true } } } }>;
    const compositions: Row[] = [], historicalFixedCodes: string[] = [];
    while (pending.length) {
      const frontier = [...new Set(pending.splice(0, 500))].filter(c => !done.has(c));
      if (!frontier.length) continue;
      frontier.forEach(c => done.add(c));
      const rows = await db.orcaproCompositionVersion.findMany({ where: { referenceId, composition: { code: { in: frontier } } }, include: { composition: true, items: { include: { input: true, childComposition: true }, orderBy: { position: 'asc' } } } });
      const found = new Set(rows.map(r => r.composition.code));
      const absent = frontier.filter(c => !found.has(c));
      historicalFixedCodes.push(...absent.filter(c => optionalRoots.has(c) && roots.includes(c)));
      const missing = absent.filter(c => !(optionalRoots.has(c) && roots.includes(c)));
      if (missing.length) throw new BadRequestException(`Composição ausente na referência: ${missing.slice(0, 8).join(', ')}.`);
      compositions.push(...rows);
      for (const row of rows) for (const item of row.items) {
        if (item.input) wanted.add(item.input.code);
        else if (item.childComposition && !done.has(item.childComposition.code)) pending.push(item.childComposition.code);
        else if (!item.childComposition) throw new ConflictException('Analítico com relação inválida.');
      }
      if (done.size > 12000 || wanted.size > 20000) throw new BadRequestException('Grafo solicitado excede limite.');
    }
    const inputs = await db.orcaproInputVersion.findMany({ where: { referenceId, input: { code: { in: [...wanted] } } }, include: { input: { include: { prices: { where: { referenceId } } } } }, orderBy: { input: { code: 'asc' } } });
    const presentInputs = new Set(inputs.map(i => i.input.code));
    const missingInputs = [...wanted].filter(code => !presentInputs.has(code));
    const analyticInputs = new Set(compositions.flatMap(c => c.items.filter(i => i.input).map(i => i.input!.code)));
    if (missingInputs.some(code => !optionalRoots.has(code) || analyticInputs.has(code))) throw new BadRequestException('Insumo solicitado ausente nesta referência.');
    historicalFixedCodes.push(...missingInputs);
    compositions.sort((a,b) => a.composition.code.localeCompare(b.composition.code));
    const raw: RawSinapi = { ...metadata, v: Number(metadata.v ?? 1), fonte: String(metadata.fonte ?? 'SINAPI'), ref: `${String(ref.month).padStart(2,'0')}/${ref.year}`, emissao: String(metadata.emissao ?? ''), ufs,
      encargos: (metadata.encargos ?? {}) as JsonRecord, grupos: metadata.grupos as string[], ct: metadata.ct as string[], cls: metadata.cls as string[], un: metadata.un as string[],
      ins: { c: [], k: [], d: [], u: [], o: [], p: [], lab: {} }, comp: { c: [], g: [], d: [], u: [], s: [], it: [] } };
    const prices = new Map<string, bigint|null>(), fallbackInputs: string[] = [];
    const amountCents = (amount: Prisma.Decimal | null | undefined): bigint|null => amount == null ? null : scaledDecimal(amount.toFixed(6), 2, true);
    for (const row of inputs) {
      const meta = (row.metadata ?? {}) as JsonRecord;
      const priceArrays = Object.fromEntries(REGIMES.map(r => [r, ufs.map(state => amountCents(row.input.prices.find(p => p.uf === state && p.regime === r)?.amount))])) as Record<'SD'|'CD'|'SE', Array<bigint|null>>;
      raw.ins.c.push(Number(row.input.code)); raw.ins.d.push(row.description); raw.ins.k.push(Number(meta.classIndex)); raw.ins.u.push(Number(meta.unitIndex)); raw.ins.o.push(Number(meta.originIndex));
      raw.ins.p.push(priceArrays.SD.map(p => p == null ? null : Number(p)));
      if (meta.hasLaborRegimes) raw.ins.lab[row.input.code] = { CD: priceArrays.CD.map(p => p == null ? null : Number(p)), SE: priceArrays.SE.map(p => p == null ? null : Number(p)) };
      const exact = priceArrays[regime][ufs.indexOf(uf)];
      const fallback = priceArrays[regime][ufs.indexOf('SP')];
      prices.set(row.input.code, exact ?? fallback ?? null);
      if (exact == null && fallback != null) fallbackInputs.push(row.input.code);
    }
    const nodes: AnalyticNode[] = compositions.map(row => {
      const meta = (row.metadata ?? {}) as JsonRecord;
      const items = row.items.map(i => ({ type: i.inputId ? 'I' as const : 'C' as const, code: i.input?.code ?? i.childComposition!.code, coefficient: i.coefficient.toFixed(12) }));
      raw.comp.c.push(Number(row.composition.code)); raw.comp.d.push(row.description); raw.comp.u.push(Number(meta.unitIndex)); raw.comp.g.push(Number(meta.groupIndex)); raw.comp.s.push(meta.situation ?? 'ATIVA');
      raw.comp.it.push(items.map(i => [Number(i.code) * (i.type === 'C' ? -1 : 1), Number(i.coefficient)]));
      return { code: row.composition.code, items };
    });
    return { referenceId, raw, compositions, inputs, prices, costs: calculateAnalyticCosts(nodes, prices), fallbackInputs, historicalFixedCodes, uf, regime };
  }
  async bundle(referenceId: string, codes: string[], inputs: string[], uf: string, regime: 'SD'|'CD'|'SE') {
    if (codes.length + inputs.length > 500) throw new BadRequestException('No máximo 500 raízes por consulta.');
    const graph = await this.graph(referenceId, codes, inputs, uf, regime);
    return { referenceId, raw: graph.raw, fallbackInputs: graph.fallbackInputs };
  }

  async projects(user: AuthenticatedUser, archived = false) {
    return this.prisma.orcaproProject.findMany({ where: { ...this.owner(user), archivedAt: archived ? { not: null } : null }, orderBy: { updatedAt: 'desc' }, take: 200,
      select: { id: true, name: true, referenceId: true, uf: true, regime: true, version: true, createdAt: true, updatedAt: true, templateId: true, archivedAt: true } });
  }
  async project(user: AuthenticatedUser, id: string, db: Db = this.prisma): Promise<OrcaproProject> {
    const project = await db.orcaproProject.findFirst({ where: { id, ...this.owner(user), archivedAt: null } });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    return project;
  }
  async projectContext(user: AuthenticatedUser, id: string) {
    const project = await this.project(user, id);
    const codes = projectOfficialCodes(project.data as JsonRecord);
    const graph = await this.graph(project.referenceId, codes.compositions, codes.inputs, project.uf, project.regime, this.prisma, false, new Set(codes.optional));
    return { project, raw: graph.raw, fallbackInputs: graph.fallbackInputs, historicalFixedCodes: graph.historicalFixedCodes };
  }
  async calculation(user: AuthenticatedUser, id: string) {
    const context = await this.projectContext(user, id);
    const runtime = loadLegacyRuntime();
    return { projectId: id, version: context.project.version, referenceId: context.project.referenceId, engineVersion: ORCAPRO_ENGINE_VERSION,
      summary: runtime.summarizeProject(context.raw, context.project.data as JsonRecord, { referenceId: context.project.referenceId }), fallbackInputs: context.fallbackInputs };
  }
  private canonicalData(data: unknown, project: { id: string; name: string; referenceId: string; uf: string; regime: string }): JsonRecord {
    return validateProjectData({ ...(data as JsonRecord), id: project.id, name: project.name, uf: project.uf, rg: project.regime, sinapiReferenceId: project.referenceId });
  }
  private async snapshot(db: Db, user: AuthenticatedUser, project: OrcaproProject) {
    await db.orcaproProjectVersion.create({ data: { projectId: project.id, version: project.version, referenceId: project.referenceId, uf: project.uf, regime: project.regime, name: project.name, data: json(project.data), engineVersion: ORCAPRO_ENGINE_VERSION, createdByUserId: user.userId } });
  }
  private async syncCustomCatalog(db: Db, user: AuthenticatedUser, data: JsonRecord, onlyMissing = false) {
    const catalog = (data.catalog ?? {}) as JsonRecord;
    for (const record of (catalog.inputs ?? []) as JsonRecord[]) {
      const last = await db.orcaproCustomInput.findFirst({ where: { ...this.owner(user), code: String(record.code) }, orderBy: { revision: 'desc' } });
      if (!last || (!onlyMissing && stableJson(last.data) !== stableJson(record))) await db.orcaproCustomInput.create({ data: { ...this.owner(user), code: String(record.code), revision: (last?.revision ?? 0) + 1, data: json(record) } });
    }
    for (const record of (catalog.compositions ?? []) as JsonRecord[]) {
      const last = await db.orcaproCustomComposition.findFirst({ where: { ...this.owner(user), code: String(record.code) }, orderBy: { revision: 'desc' } });
      if (!last || (!onlyMissing && stableJson(last.data) !== stableJson(record))) {
        let originType = last?.originType ?? 'OWN', originCode = last?.originCode ?? null, originReferenceId = last?.originReferenceId ?? null, originCompositionId = last?.originCompositionId ?? null;
        if (record.origin_reference_id && record.origin_code && originType !== 'SINAPI') {
          originReferenceId = String(record.origin_reference_id); originCode = officialCode(record.origin_code);
          await this.reference(originReferenceId,db);
          const original = await db.orcaproCompositionVersion.findFirst({ where: { referenceId: originReferenceId,composition: { code: originCode } } });
          if (!original) throw new BadRequestException('Origem da composição não encontrada na referência informada.');
          originCompositionId = original.compositionId; originType = 'SINAPI';
        } else if (!last && /^\d+$/.test(String(record.base ?? ''))) {
          // Preserve historical evidence without inventing a reference that the export never recorded.
          originType = 'LEGACY_UNVERIFIED'; originCode = String(record.base);
        }
        const canonical = originType === 'SINAPI' ? { ...record,origin_type: 'SINAPI',origin_code: originCode,origin_reference_id: originReferenceId,origin_composition_id: originCompositionId } : record;
        await db.orcaproCustomComposition.create({ data: { ...this.owner(user), code: String(record.code), description: String(record.desc ?? record.description ?? ''), revision: (last?.revision ?? 0) + 1, data: json(canonical),originType,originCode,originReferenceId,originCompositionId } });
      }
    }
  }
  async createProject(user: AuthenticatedUser, dto: CreateProjectDto, templateId?: string) {
    assertContext(dto.uf, dto.regime);
    if (!dto.name.trim()) throw new BadRequestException('Nome do projeto obrigatório.');
    return this.prisma.$transaction(async db => {
      const defaultReference = await db.orcaproSettings.findUnique({ where: { id: 'global' } });
      const referenceId = dto.referenceId ?? defaultReference?.defaultReferenceId;
      if (!referenceId) throw new BadRequestException('Selecione uma referência SINAPI publicada.');
      const ref = await this.reference(referenceId, db);
      if (ref.status !== OrcaproReferenceStatus.PUBLISHED && !templateId) throw new BadRequestException('Novos projetos exigem referência publicada.');
      const id = randomUUID();
      const initial = dto.data ?? { root: { id: 'root', kind: 'stage', name: '', children: [] }, bdi: 0.25, bdi2: null, round: 'round', links: [], seq: 'escalonado', start: new Date().toISOString().slice(0,10), calendar: { workdays: [1,2,3,4,5], hpd: 8.8, holidays: true, carnaval: false, corpus: false, extra: [] }, created: Date.now(), updated: Date.now(), v: 1 };
      const data = this.canonicalData(initial, { id, name: dto.name.trim(), referenceId, uf: dto.uf, regime: dto.regime });
      const codes = projectOfficialCodes(data);
      await this.graph(referenceId, codes.compositions, codes.inputs, dto.uf, dto.regime, db, false, new Set(codes.optional));
      const project = await db.orcaproProject.create({ data: { id, ...this.owner(user), name: dto.name.trim(), referenceId, uf: dto.uf, regime: dto.regime, data: json(data), templateId } });
      await this.syncCustomCatalog(db, user, data, true); await this.snapshot(db, user, project);
      await this.audit(db, user, 'project.create', id, { referenceId, templateId });
      return project;
    }, { timeout: 30000 });
  }
  async importLegacyProject(user: AuthenticatedUser, dto: CreateProjectDto) {
    if (!dto.referenceId || !dto.data) throw new BadRequestException('Importação histórica exige documento e referência explicitamente selecionada.');
    const data = dto.data.project && typeof dto.data.project === 'object' ? dto.data.project as JsonRecord : dto.data;
    return { project: await this.createProject(user, { ...dto, data }), report: { migrated: true, officialCatalogCopied: false, ownerFromSession: true, referenceId: dto.referenceId } };
  }
  async exportProject(user: AuthenticatedUser, id: string) {
    const project = await this.project(user, id);
    return { format: 'orcapro-project', version: 1, referenceId: project.referenceId, uf: project.uf, regime: project.regime, project: project.data };
  }
  async saveProject(user: AuthenticatedUser, id: string, dto: SaveProjectDto, restoringHistoricalVersion = false) {
    return this.prisma.$transaction(async db => {
      const current = await this.project(user, id, db);
      if (current.version !== dto.expectedVersion) throw new ConflictException('Projeto alterado em outra sessão. Recarregue antes de salvar.');
      const referenceId = dto.referenceId ?? current.referenceId, uf = dto.uf ?? current.uf, regime = dto.regime ?? current.regime, name = (dto.name ?? current.name).trim();
      if (!name) throw new BadRequestException('Nome obrigatório.'); assertContext(uf, regime);
      const ref = await this.reference(referenceId, db);
      if (referenceId !== current.referenceId && ref.status !== OrcaproReferenceStatus.PUBLISHED && !restoringHistoricalVersion) throw new BadRequestException('Mudança explícita exige referência publicada.');
      const data = this.canonicalData(dto.data, { id, name, referenceId, uf, regime });
      const codes = projectOfficialCodes(data); await this.graph(referenceId, codes.compositions, codes.inputs, uf, regime, db, false, new Set(codes.optional));
      const updated = await db.orcaproProject.updateMany({ where: { id, ...this.owner(user), version: dto.expectedVersion, archivedAt: null }, data: { name, referenceId, uf, regime, data: json(data), version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('Conflito de versão do projeto.');
      const project = await this.project(user, id, db);
      await this.snapshot(db, user, project);
      await this.audit(db, user, 'project.save', id, { version: project.version, referenceId, uf, regime });
      return project;
    }, { timeout: 30000 });
  }
  async archiveProject(user: AuthenticatedUser, id: string, expectedVersion: number) {
    return this.prisma.$transaction(async db => {
      await this.project(user, id, db);
      const updated = await db.orcaproProject.updateMany({ where: { id, ...this.owner(user), version: expectedVersion, archivedAt: null }, data: { archivedAt: new Date(), version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('Conflito de versão.');
      const archived = await db.orcaproProject.findFirst({ where: { id, ...this.owner(user) } });
      if (archived) await this.snapshot(db, user, archived);
      await this.audit(db, user, 'project.archive', id); return { archived: true };
    });
  }
  async unarchiveProject(user: AuthenticatedUser, id: string, expectedVersion: number) {
    return this.prisma.$transaction(async db => {
      const current = await db.orcaproProject.findFirst({ where: { id, ...this.owner(user), archivedAt: { not: null } } });
      if (!current) throw new NotFoundException('Projeto arquivado não encontrado.');
      const changed = await db.orcaproProject.updateMany({ where: { id, ...this.owner(user), archivedAt: { not: null }, version: expectedVersion }, data: { archivedAt: null, version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('Conflito de versão.');
      const project = await this.project(user, id, db); await this.snapshot(db, user, project); await this.audit(db, user, 'project.unarchive', id, { version: project.version }); return project;
    });
  }
  async versions(user: AuthenticatedUser, id: string) {
    await this.project(user, id);
    return this.prisma.orcaproProjectVersion.findMany({ where: { projectId: id }, orderBy: { version: 'desc' }, take: 200, select: { id: true, version: true, name: true, referenceId: true, uf: true, regime: true, engineVersion: true, createdAt: true } });
  }
  async restore(user: AuthenticatedUser, id: string, version: number, expectedVersion: number) {
    await this.project(user, id);
    const snapshot = await this.prisma.orcaproProjectVersion.findUnique({ where: { projectId_version: { projectId: id, version } } });
    if (!snapshot) throw new NotFoundException('Versão não encontrada.');
    return this.saveProject(user, id, { expectedVersion, name: snapshot.name, referenceId: snapshot.referenceId, uf: snapshot.uf, regime: snapshot.regime, data: snapshot.data as JsonRecord }, true);
  }
  templates() { return this.prisma.orcaproTemplate.findMany({ where: { isPublic: true }, select: { id: true, code: true, name: true, referenceId: true, uf: true, regime: true, version: true } }); }
  async cloneTemplate(user: AuthenticatedUser, id: string, dto: CloneTemplateDto) {
    const template = await this.prisma.orcaproTemplate.findFirst({ where: { id, isPublic: true } });
    if (!template) throw new NotFoundException('Exemplo indisponível.');
    return this.createProject(user, { name: dto.name ?? template.name, referenceId: template.referenceId, uf: dto.uf ?? template.uf, regime: dto.regime ?? template.regime, data: { ...template.data as JsonRecord,projectTemplateId: template.id,projectTemplateVersion: template.version } }, template.id);
  }
  async updateTemplate(user: AuthenticatedUser, id: string, dto: SaveProjectDto) {
    this.access.assertAdmin(user);
    return this.prisma.$transaction(async db => {
      const template = await db.orcaproTemplate.findUnique({ where: { id } });
      if (!template) throw new NotFoundException('Template ausente.');
      const referenceId = dto.referenceId ?? template.referenceId, uf = dto.uf ?? template.uf, regime = dto.regime ?? template.regime, name = dto.name ?? template.name;
      await this.reference(referenceId, db); assertContext(uf, regime);
      const data = this.canonicalData(dto.data, { id, name, referenceId, uf, regime });
      const codes = projectOfficialCodes(data); await this.graph(referenceId, codes.compositions, codes.inputs, uf, regime, db, false, new Set(codes.optional));
      const changed = await db.orcaproTemplate.updateMany({ where: { id, version: dto.expectedVersion }, data: { name, referenceId, uf, regime, data: json(data), version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('Conflito de versão do template.');
      await this.audit(db, user, 'template.update', id); return db.orcaproTemplate.findUnique({ where: { id } });
    }, { timeout: 30000 });
  }
  async customCompositions(user: AuthenticatedUser) {
    const rows = await this.prisma.orcaproCustomComposition.findMany({ where: { ...this.owner(user), archivedAt: null }, orderBy: { revision: 'desc' }, take: 10000 });
    const seen = new Set<string>(); return rows.filter(r => { if (seen.has(r.code)) return false; seen.add(r.code); return true; });
  }
  async customInputs(user: AuthenticatedUser) {
    const rows = await this.prisma.orcaproCustomInput.findMany({ where: { ...this.owner(user), archivedAt: null }, orderBy: { revision: 'desc' }, take: 10000 });
    const seen = new Set<string>(); return rows.filter(r => { if (seen.has(r.code)) return false; seen.add(r.code); return true; });
  }
  async saveCustom(user: AuthenticatedUser, type: 'I'|'C', record: JsonRecord) {
    const inputs = await this.customInputs(user), comps = await this.customCompositions(user);
    const candidateInputs: unknown[] = inputs.filter(x => x.code !== record.code).map(x => x.data);
    const candidateComps: unknown[] = comps.filter(x => x.code !== record.code).map(x => x.data);
    (type === 'I' ? candidateInputs : candidateComps).push(json(record));
    const data = validateProjectData({ root: { id: 'root', kind: 'stage', children: [] }, catalog: { inputs: candidateInputs, compositions: candidateComps } });
    await this.prisma.$transaction(async db => { await this.syncCustomCatalog(db, user, data); await this.audit(db, user, 'custom.revise', String(record.code), { type }); });
    const list = type === 'I' ? await this.customInputs(user) : await this.customCompositions(user);
    return list.find(x => x.code === record.code);
  }
  async adaptComposition(user: AuthenticatedUser, code: string, dto: AdaptCompositionDto) {
    const source = await this.composition(code, dto.referenceId, 'SP', 'SD');
    const newCode = `CP-${randomUUID().slice(0, 18).toUpperCase()}`;
    const record = { id: newCode, code: newCode, desc: source.description, unit: source.unit, group: source.group, src: 'PRÓPRIA', source: `SINAPI ${code} — ${dto.referenceId}`, mode: 'analytic', revision: 1, history: [], notes: '', items: source.items.map(i => ({ type: i.type, code: Number(i.code), coef: Number(i.coefficient) })),
      origin_type: 'SINAPI', origin_code: code, origin_reference_id: dto.referenceId, origin_composition_id: source.id };
    return this.prisma.$transaction(async db => {
      const result = await db.orcaproCustomComposition.create({ data: { ...this.owner(user), code: newCode, description: source.description, data: json(record), originType: 'SINAPI', originCode: code, originReferenceId: dto.referenceId, originCompositionId: source.id } });
      await this.audit(db, user, 'composition.adapt', result.id, { sourceCode: code, referenceId: dto.referenceId }); return result;
    });
  }

  async importSinapi(user: AuthenticatedUser, dto: ImportSinapiDto, originalChecksum?: string) {
    this.access.assertAdmin(user);
    const raw = validateRawSinapi(dto.raw), normalizationChecksum = createHash('sha256').update(JSON.stringify(raw)).digest('hex'), checksum = originalChecksum ?? normalizationChecksum;
    const [month, year] = raw.ref.split('/').map(Number);
    const referenceId = randomUUID();
    const { ins, comp, ...metadata } = raw;
    return this.prisma.$transaction(async db => {
      const existing = await db.orcaproReference.findUnique({ where: { year_month_revision: { year, month, revision: dto.revision } } });
      if (existing) throw new ConflictException('Referência/revisão já importada; publique ou crie outra revisão.');
      const ref = await db.orcaproReference.create({ data: { id: referenceId, year, month, revision: dto.revision, label: `${raw.ref} • revisão ${dto.revision}`, sourceChecksum: checksum, sourceName: dto.sourceName, importedByUserId: user.userId, metadata: json(metadata) } });
      await batch(ins.c.map(c => ({ id: randomUUID(), code: officialCode(c) })), rows => db.orcaproInput.createMany({ data: rows, skipDuplicates: true }));
      await batch(comp.c.map(c => ({ id: randomUUID(), code: officialCode(c) })), rows => db.orcaproComposition.createMany({ data: rows, skipDuplicates: true }));
      const [inputIdentities, compIdentities] = await Promise.all([
        db.orcaproInput.findMany({ where: { code: { in: ins.c.map(officialCode) } } }), db.orcaproComposition.findMany({ where: { code: { in: comp.c.map(officialCode) } } }),
      ]);
      const inputs = new Map(inputIdentities.map(i => [i.code,i.id])), comps = new Map(compIdentities.map(c => [c.code,c.id]));
      await batch(ins.c.map((c,i) => ({ id: randomUUID(), referenceId, inputId: inputs.get(officialCode(c))!, description: ins.d[i], unit: raw.un[ins.u[i]], nature: raw.cls[ins.k[i]], origin: ['C','CR','—'][ins.o[i]] ?? '—',
        metadata: json({ classIndex: ins.k[i], unitIndex: ins.u[i], originIndex: ins.o[i], hasLaborRegimes: !!ins.lab[String(c)] }) })), rows => db.orcaproInputVersion.createMany({ data: rows }));
      const compVersions = comp.c.map((c,i) => ({ id: randomUUID(), referenceId, compositionId: comps.get(officialCode(c))!, description: comp.d[i], unit: raw.un[comp.u[i]], group: raw.grupos[comp.g[i]],
        metadata: json({ unitIndex: comp.u[i], groupIndex: comp.g[i], situation: comp.s[i] }) }));
      await batch(compVersions, rows => db.orcaproCompositionVersion.createMany({ data: rows }));
      const analytic = comp.c.flatMap((_,i) => comp.it[i].map((item,position) => ({ id: randomUUID(), compositionVersionId: compVersions[i].id, position,
        inputId: item[0] > 0 ? inputs.get(officialCode(item[0]))! : null, childCompositionId: item[0] < 0 ? comps.get(officialCode(Math.abs(item[0])))! : null, coefficient: item[1].toFixed(12) })));
      await batch(analytic, rows => db.orcaproAnalyticItem.createMany({ data: rows }));
      let priceCount = 0, missingPrices = 0;
      for (let start = 0; start < ins.c.length; start += 100) {
        const prices: Prisma.OrcaproInputPriceCreateManyInput[] = [];
        for (let i = start; i < Math.min(start + 100, ins.c.length); i++) for (const regime of REGIMES) {
          const arr = (regime !== 'SD' ? ins.lab[String(ins.c[i])]?.[regime] ?? ins.p[i] : ins.p[i]) ?? raw.ufs.map(() => null);
          raw.ufs.forEach((uf,j) => { if (arr[j] == null) missingPrices++; prices.push({ id: randomUUID(), referenceId, inputId: inputs.get(officialCode(ins.c[i]))!, uf, regime, amount: arr[j] == null ? null : centsToAmount(BigInt(arr[j]!)), source: 'SINAPI' }); });
        }
        priceCount += prices.length; await batch(prices, rows => db.orcaproInputPrice.createMany({ data: rows }));
      }
      const report = { inputs: ins.c.length, compositions: comp.c.length, analyticItems: analytic.length, prices: priceCount, missingPrices, ufs: raw.ufs, regimes: REGIMES, checksum, normalizationChecksum, transactional: true, status: 'DRAFT' };
      await db.orcaproImport.create({ data: { referenceId, createdByUserId: user.userId, checksum, sourceName: dto.sourceName, report: json(report) } });
      await this.audit(db, user, 'sinapi.import', referenceId, report);
      return { reference: ref, report };
    }, { maxWait: 30000, timeout: 180000 });
  }
  async importSinapiFile(user: AuthenticatedUser, file: Express.Multer.File | undefined, revision: number) {
    this.access.assertAdmin(user);
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo SINAPI obrigatório.');
    if (!file.originalname.toLowerCase().endsWith('.xlsx') || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) throw new BadRequestException('Envie um XLSX SINAPI válido.');
    const permitted = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream','application/zip'];
    if (!permitted.includes(file.mimetype)) throw new BadRequestException('MIME do arquivo não permitido.');
    const runtime = loadLegacyRuntime();
    protectLegacyXlsx(runtime,file.buffer);
    let raw: JsonRecord;
    try { raw = await runtime.OP.sinapi.importXlsx(new Blob([new Uint8Array(file.buffer)])); }
    catch { throw new BadRequestException('Não foi possível validar/processar o XLSX oficial SINAPI.'); }
    return this.importSinapi(user, { raw, sourceName: file.originalname.slice(0,255), revision }, createHash('sha256').update(file.buffer).digest('hex'));
  }
  async validateReference(user: AuthenticatedUser, id: string) {
    this.access.assertAdmin(user);
    return this.prisma.$transaction(async db => {
      const reference = await this.reference(id, db, true);
      if (reference.status !== OrcaproReferenceStatus.DRAFT) throw new ConflictException('Somente uma referência DRAFT pode ser validada.');
      const metadata = reference.metadata as JsonRecord;
      const [comps, ins] = await Promise.all([
        db.orcaproCompositionVersion.findMany({ where: { referenceId: id }, include: { composition: true, items: { include: { input: true, childComposition: true } } } }),
        db.orcaproInputVersion.findMany({ where: { referenceId: id }, include: { input: true } }),
      ]);
      if (!comps.length || !ins.length) throw new BadRequestException('Referência vazia.');
      const nodes: AnalyticNode[] = comps.map(c => ({ code: c.composition.code, items: c.items.map(i => ({ type: i.inputId ? 'I' : 'C', code: i.input?.code ?? i.childComposition!.code, coefficient: i.coefficient.toFixed(12) })) }));
      const priceKeys = new Map(ins.map(i => [i.input.code, 0n])); calculateAnalyticCosts(nodes, priceKeys);
      const prices = await db.orcaproInputPrice.count({ where: { referenceId: id } });
      const expectedPrices = ins.length * (metadata.ufs as string[]).length * REGIMES.length;
      if (prices !== expectedPrices) throw new BadRequestException('Grade referência × UF × regime incompleta.');
      const report = { valid: true, inputs: ins.length, compositions: comps.length, prices, expectedPrices, analyticItems: comps.reduce((n,c) => n + c.items.length, 0), validatedAt: new Date().toISOString() };
      const changed = await db.orcaproReference.updateMany({ where: { id, status: OrcaproReferenceStatus.DRAFT }, data: { status: OrcaproReferenceStatus.VALIDATED, validatedAt: new Date(), validation: json(report) } });
      if (changed.count !== 1) throw new ConflictException('Referência foi alterada durante a validação.');
      await this.audit(db, user, 'sinapi.validate', id, report); return { referenceId: id, status: 'VALIDATED', report };
    }, { timeout: 60000 });
  }
  async publishReference(user: AuthenticatedUser, id: string) {
    this.access.assertAdmin(user);
    return this.prisma.$transaction(async db => {
      const changed = await db.orcaproReference.updateMany({ where: { id, status: OrcaproReferenceStatus.VALIDATED }, data: { status: OrcaproReferenceStatus.PUBLISHED, publishedAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('Publicação exige referência VALIDATED. Referências publicadas são imutáveis.');
      await this.audit(db, user, 'sinapi.publish', id); return { referenceId: id, status: 'PUBLISHED' };
    });
  }
  async defaultReference(user: AuthenticatedUser, referenceId: string) {
    this.access.assertAdmin(user);
    return this.prisma.$transaction(async db => {
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproSettings WHERE id = 'global' FOR UPDATE`);
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproReference WHERE id = ${referenceId} FOR UPDATE`);
      const reference = await this.reference(referenceId, db);
      if (reference.status !== OrcaproReferenceStatus.PUBLISHED) throw new BadRequestException('Padrão exige referência publicada.');
      const settings = await db.orcaproSettings.upsert({ where: { id: 'global' }, create: { id: 'global', defaultReferenceId: referenceId }, update: { defaultReferenceId: referenceId } });
      await this.audit(db, user, 'sinapi.default.change', referenceId); return settings;
    });
  }
  async archiveReference(user: AuthenticatedUser, id: string) {
    this.access.assertAdmin(user);
    return this.prisma.$transaction(async db => {
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproSettings WHERE id = 'global' FOR UPDATE`);
      await db.$queryRaw(Prisma.sql`SELECT id FROM OrcaproReference WHERE id = ${id} FOR UPDATE`);
      const settings = await db.orcaproSettings.findUnique({ where: { id: 'global' } });
      if (settings?.defaultReferenceId === id) throw new ConflictException('Escolha outro padrão antes de arquivar esta referência.');
      const changed = await db.orcaproReference.updateMany({ where: { id, status: OrcaproReferenceStatus.PUBLISHED }, data: { status: OrcaproReferenceStatus.ARCHIVED, archivedAt: new Date() } });
      if (!changed.count) throw new ConflictException('Somente referência publicada pode ser arquivada.');
      await this.audit(db, user, 'sinapi.archive', id); return { referenceId: id, status: 'ARCHIVED' };
    });
  }
  async adminLogs(user: AuthenticatedUser, query: AdminListQuery) {
    this.access.assertAdmin(user);
    const [items,total] = await Promise.all([this.prisma.orcaproAudit.findMany({ orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),this.prisma.orcaproAudit.count()]);
    return { items,total,page: query.page,pageSize: query.pageSize };
  }
  async adminUsers(user: AuthenticatedUser, query: AdminListQuery) {
    this.access.assertAdmin(user);
    const where: Prisma.UserWhereInput = { deletedAt: null };
    const [items,total] = await Promise.all([this.prisma.user.findMany({ where, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true,name: true,email: true,status: true,orcaproAccess: true } }),this.prisma.user.count({ where })]);
    return { items: items.map(u => ({ id: u.id,name: u.name,email: u.email,maintenanceStatus: u.status,orcaproEnabled: u.orcaproAccess?.enabled !== false,orcaproRole: this.access.role({ ...user,userId: u.id }) })),total,page: query.page,pageSize: query.pageSize };
  }
  async setUserAccess(user: AuthenticatedUser, id: string, enabled: boolean) {
    this.access.assertAdmin(user);
    if (id === user.userId && !enabled) throw new BadRequestException('O administrador não pode desativar o próprio acesso.');
    return this.prisma.$transaction(async db => {
      if (!(await db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } }))) throw new NotFoundException('Usuário ausente.');
      const result = await db.orcaproUserAccess.upsert({ where: { userId: id }, create: { userId: id,enabled,updatedByUserId: user.userId }, update: { enabled,updatedByUserId: user.userId } });
      await this.audit(db, user, 'user.orcapro-access.change', id, { enabled }); return result;
    });
  }
}

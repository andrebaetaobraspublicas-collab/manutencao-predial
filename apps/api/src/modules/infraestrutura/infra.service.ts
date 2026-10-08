import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Worker } from 'node:worker_threads';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { InfraDatabase, type InfraSql } from './infra-db';
import { InfraAccess } from './infra.guard';
import { context, digest, fields, integer, json, object, page, parsed, reference, sha, text, uuid, type InfraObject } from './infra-domain';

type ProjectRow = { id: string; user_id: string; tenant_id: string; cycle_id: string; name: string; uf: string; regime: string; bdi: string; data: any; version: number; deleted_at: Date|null; updated_at: Date; created_at: Date };
type CycleRow = { id: string; uf: string; ref: string; status: string; import_status: string; content_hash: string; raw_size: bigint; expected_chunks: number; validation: any; example_json: any };
const cycleOrder = 'ref DESC,uf,published_at DESC,id';
@Injectable()
export class InfraService {
  private comparisonRunning = false;
  constructor(private readonly db: InfraDatabase, private readonly config: ConfigService, private readonly primary: PrismaService, private readonly access: InfraAccess) {}
  private async audit(db: InfraSql, user: AuthenticatedUser, action: string, entity: string, id: string, payload: unknown = {}) {
    await db.query('INSERT INTO InfraAudit(id,tenant_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?,?)',[randomUUID(),user.tenantId,user.userId,action,entity,id,json(payload,2 * 1024 * 1024)]);
  }
  private shape(row: ProjectRow, detail = true) {
    return { id: row.id, name: row.name, cycleId: row.cycle_id, uf: row.uf, regime: row.regime, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at, ...(detail ? { data: parsed(row.data) } : {}) };
  }
  private async owned(db: InfraSql, user: AuthenticatedUser, id: string, lock = false, trash = false): Promise<ProjectRow> {
    const rows = await db.query('SELECT * FROM InfraProject WHERE id=? AND tenant_id=? AND user_id=?' + (trash ? '' : ' AND deleted_at IS NULL') + (lock ? ' FOR UPDATE' : ''),[uuid(id),user.tenantId,user.userId]) as ProjectRow[];
    if (!rows[0]) throw new NotFoundException('Projeto não encontrado na sua conta.');
    return rows[0];
  }
  private async cycle(db: InfraSql, user: AuthenticatedUser, id: string, existing = false): Promise<CycleRow> {
    const rows = await db.query('SELECT * FROM InfraCycle WHERE id=?',[uuid(id)]) as CycleRow[];
    const found = rows[0];
    if (!found) throw new NotFoundException('Referência SICRO não encontrada.');
    if (found.status === 'PUBLISHED' && found.import_status === 'PASSED') return found;
    if (existing && found.status === 'ARCHIVED') {
      const bound = await db.query('SELECT id FROM InfraProject WHERE cycle_id=? AND tenant_id=? AND user_id=? LIMIT 1',[id,user.tenantId,user.userId]) as any[];
      if (bound.length) return found;
    }
    const profile = await this.access.principal(user);
    if (existing && (this.access.configuredAdmin(user.userId) || profile?.role === 'ADMIN')) return found;
    throw new NotFoundException('Esta referência SICRO não está publicada para novos projetos.');
  }
  private document(dataInput: unknown, id: string, name: string, uf: string, regime: string): { data: string; bdi: string } {
    const data = object(dataInput);
    const bdi = data.bdi ?? 0;
    if (typeof bdi !== 'number' || !Number.isFinite(bdi) || bdi < 0 || bdi > 100000) throw new BadRequestException('Taxa de BDI inválida.');
    return { data: json({ ...data,id,name,uf,rg: regime },20 * 1024 * 1024,true), bdi: bdi.toFixed(8) };
  }
  private assertCycleUf(cycle: CycleRow, uf: string): void {
    const validation = parsed(cycle.validation);
    const ufs = Array.isArray(validation?.ufs) ? validation.ufs : [cycle.uf];
    if (uf !== cycle.uf || ufs.length !== 1 || ufs[0] !== cycle.uf) throw new BadRequestException('Cada fotografia SICRO representa uma única UF. Importe o ciclo da UF desejada e compare a migração do orçamento para mudar o estado.');
  }
  private async history(db: InfraSql, user: AuthenticatedUser, row: ProjectRow) {
    const copy = { ...this.shape(row), bdi: row.bdi };
    await db.query('INSERT INTO InfraProjectVersion(project_id,version,gz_blob,created_by) VALUES(?,?,?,?)',[row.id,row.version,gzipSync(Buffer.from(json(copy,21 * 1024 * 1024))),user.userId]);
    const retention = Math.max(10,Math.min(500,Number(this.config.get<string>('INFRA_PROJECT_VERSION_RETENTION') ?? 100)));
    await db.query('DELETE FROM InfraProjectVersion WHERE project_id=? AND version < ?',[row.id,Math.max(1,row.version - retention + 1)]);
  }
  async cycles(user: AuthenticatedUser, all = false) {
    const rows = all
      ? await this.db.query<any[]>('SELECT id,source,uf,ref,status,import_status AS importStatus,content_hash AS contentHash,raw_size AS rawSize,validation,published_at AS publishedAt FROM InfraCycle ORDER BY ' + cycleOrder)
      : await this.db.query<any[]>('SELECT id,source,uf,ref,status,content_hash AS contentHash,raw_size AS rawSize,published_at AS publishedAt FROM InfraCycle WHERE (status=\'PUBLISHED\' AND import_status=\'PASSED\') OR (status=\'ARCHIVED\' AND EXISTS (SELECT 1 FROM InfraProject p WHERE p.cycle_id=InfraCycle.id AND p.tenant_id=? AND p.user_id=?)) ORDER BY ' + cycleOrder,[user.tenantId,user.userId]);
    return { items: rows.map(row => ({ ...row,rawSize: Number(row.rawSize),...(all ? { validation: parsed(row.validation) } : {}) })) };
  }
  async snapshot(user: AuthenticatedUser, id: string, pem = false) {
    await this.cycle(this.db as unknown as InfraSql,user,id,true);
    const rows = await this.db.query<any[]>('SELECT gz_blob,etag FROM ' + (pem ? 'InfraPemSnapshot' : 'InfraCycleSnapshot') + ' WHERE cycle_id=?',[id]);
    if (!rows[0]) throw new NotFoundException(pem ? 'Biblioteca PEM não publicada nesta referência.' : 'Snapshot SICRO ainda não disponível.');
    return { gzip: rows[0].gz_blob as Buffer, etag: String(rows[0].etag) };
  }
  async compositions(user: AuthenticatedUser, id: string, query: InfraObject) {
    await this.cycle(this.db as unknown as InfraSql,user,id,true);
    const current = page(query.page), limit = page(query.pageSize,50,100);
    const search = typeof query.q === 'string' ? text(query.q,'Busca',200,true) : '';
    const group = typeof query.group === 'string' ? text(query.group,'Grupo',64,true) : '';
    const values: unknown[] = [id];
    let filter = 'cycle_id=?';
    if (search) { filter += ' AND (code=? OR description LIKE ?)'; values.push(search,`%${search.replace(/[\\%_]/g,'\\$&')}%`); }
    if (group) { filter += ' AND group_code=?'; values.push(group); }
    const rows = await this.db.query<any[]>('SELECT code,description,unit,group_code AS groupCode,production,fic,official_cost AS officialCost FROM InfraCycleComposition WHERE ' + filter + ' ORDER BY code LIMIT ? OFFSET ?',[...values,limit,(current - 1) * limit]);
    const total = await this.db.query<any[]>('SELECT COUNT(*) AS total FROM InfraCycleComposition WHERE ' + filter,values);
    return { items: rows, total: String(total[0].total), page: current, pageSize: limit };
  }
  async pem(user: AuthenticatedUser, id: string, code: string) {
    const cycle = await this.cycle(this.db as unknown as InfraSql,user,id,true);
    const rows = await this.db.query<any[]>('SELECT comp_code AS code,data,version FROM InfraPem WHERE cycle_id=? AND comp_code=?',[id,text(code,'Código PEM',64)]);
    if (!rows[0]) throw new NotFoundException('Demonstrativo PEM não encontrado.');
    return { ...rows[0], data: { ...parsed(rows[0].data),names: parsed(cycle.validation)?.pemNames ?? [] } };
  }
  async projects(user: AuthenticatedUser, trash = false) {
    const rows = await this.db.query<ProjectRow[]>('SELECT id,name,cycle_id,uf,regime,version,updated_at,created_at,deleted_at FROM InfraProject WHERE tenant_id=? AND user_id=? AND deleted_at IS ' + (trash ? 'NOT NULL' : 'NULL') + ' ORDER BY updated_at DESC LIMIT 1000',[user.tenantId,user.userId]);
    return { items: rows.map(row => this.shape(row,false)) };
  }
  async project(user: AuthenticatedUser, id: string) { return this.shape(await this.owned(this.db as unknown as InfraSql,user,id)); }
  async adminReadProject(user: AuthenticatedUser, id: string) {
    const rows = await this.db.query<ProjectRow[]>('SELECT * FROM InfraProject WHERE id=?',[uuid(id)]);
    if (!rows[0]) throw new NotFoundException('Projeto não encontrado.');
    await this.audit(this.db as unknown as InfraSql,user,'admin.project.read','project',id,{ ownerUserId: rows[0].user_id,customerTenantId: rows[0].tenant_id,readonly: true });
    return this.shape(rows[0]);
  }
  private async insertProject(db: InfraSql, user: AuthenticatedUser, input: InfraObject) {
    const cycleId = uuid(input.cycleId), base = await this.cycle(db,user,cycleId);
    const name = text(input.name ?? 'Novo orçamento','Nome do orçamento');
    const { uf,regime } = context(input.uf ?? base.uf,input.regime ?? 'SD');
    this.assertCycleUf(base,uf);
    const id = randomUUID();
    const source = input.example === true ? parsed(base.example_json) : (input.data ?? { root: { id: randomUUID(),name: 'Orçamento',children: [] } });
    if (!source) throw new BadRequestException('Esta referência não contém projeto de exemplo.');
    const document = this.document(source,id,name,uf,regime);
    await db.query('INSERT INTO InfraProject(id,user_id,tenant_id,cycle_id,name,uf,regime,bdi,data) VALUES(?,?,?,?,?,?,?,?,?)',[id,user.userId,user.tenantId,cycleId,name,uf,regime,document.bdi,document.data]);
    const row = await this.owned(db,user,id);
    await this.history(db,user,row);
    await this.audit(db,user,'project.create','project',id,{ cycleId,example: input.example === true });
    return this.shape(row);
  }
  async createProject(user: AuthenticatedUser, input: unknown) {
    const body = fields(input,['cycleId','name','uf','regime','data','example']);
    if (body.example != null && typeof body.example !== 'boolean') throw new BadRequestException('Opção de exemplo inválida.');
    return this.db.transaction(db => this.insertProject(db,user,body));
  }
  async openWorkspace(user: AuthenticatedUser) {
    return this.db.transaction(async db => {
      await db.query('SELECT id FROM InfraUser WHERE external_user_id=? AND tenant_id=? FOR UPDATE',[user.userId,user.tenantId]);
      const existing = await db.query('SELECT * FROM InfraProject WHERE user_id=? AND tenant_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 1',[user.userId,user.tenantId]) as ProjectRow[];
      if (existing[0]) return this.shape(existing[0]);
      const published = await db.query('SELECT id,uf,example_json FROM InfraCycle WHERE status=\'PUBLISHED\' AND import_status=\'PASSED\' ORDER BY ' + cycleOrder + ' LIMIT 1') as any[];
      if (!published[0]) throw new NotFoundException('O administrador ainda não publicou uma referência SICRO.');
      return this.insertProject(db,user,{ cycleId: published[0].id,uf: published[0].uf,regime: 'SD',name: published[0].example_json ? 'Exemplo de rodovia — SICRO' : 'Novo orçamento',example: !!published[0].example_json });
    });
  }
  private mismatch(row: ProjectRow, version: unknown) {
    if (row.version !== integer(version,'Versão',1,2147483647)) throw new ConflictException({ message: 'Este projeto foi alterado em outra aba. Recarregue ou salve como cópia.', currentVersion: row.version, updatedAt: row.updated_at });
  }
  private async update(db: InfraSql, user: AuthenticatedUser, row: ProjectRow, body: InfraObject, action: string, cycleId = row.cycle_id, historicalCycle?: CycleRow) {
    this.mismatch(row,body.version);
    const name = text(body.name ?? row.name,'Nome do orçamento');
    const { uf,regime } = context(body.uf ?? row.uf,body.regime ?? row.regime);
    if (historicalCycle && historicalCycle.id !== cycleId) throw new ConflictException('Contexto histórico da referência divergente.');
    this.assertCycleUf(historicalCycle ?? await this.cycle(db,user,cycleId,true),uf);
    const document = this.document(body.data,row.id,name,uf,regime);
    const result = await db.query('UPDATE InfraProject SET name=?,uf=?,regime=?,bdi=?,data=?,cycle_id=?,version=version+1 WHERE id=? AND tenant_id=? AND user_id=? AND version=? AND deleted_at IS NULL',[name,uf,regime,document.bdi,document.data,cycleId,row.id,user.tenantId,user.userId,row.version]) as any;
    if (Number(result.affectedRows) !== 1) throw new ConflictException('Projeto alterado por outra operação.');
    const saved = await this.owned(db,user,row.id);
    await this.history(db,user,saved);
    await this.audit(db,user,action,'project',row.id,{ version: saved.version,cycleId });
    return this.shape(saved);
  }
  async saveProject(user: AuthenticatedUser, id: string, input: unknown) {
    const body = fields(input,['version','name','uf','regime','data']);
    return this.db.transaction(async db => this.update(db,user,await this.owned(db,user,id,true),body,'project.save'));
  }
  async archiveProject(user: AuthenticatedUser, id: string, input: unknown, restore = false) {
    const body = fields(input,['version']);
    return this.db.transaction(async db => {
      const row = await this.owned(db,user,id,true,restore); this.mismatch(row,body.version);
      const result = await db.query('UPDATE InfraProject SET deleted_at=?,version=version+1 WHERE id=? AND tenant_id=? AND user_id=? AND version=?',[restore ? null : new Date(),row.id,user.tenantId,user.userId,row.version]) as any;
      if (Number(result.affectedRows) !== 1) throw new ConflictException('Projeto alterado em outra aba.');
      await this.audit(db,user,restore ? 'project.unarchive' : 'project.archive','project',id,{ version: row.version + 1 });
      return { id,version: row.version + 1,deleted: !restore };
    });
  }
  async duplicate(user: AuthenticatedUser, id: string, input: unknown) {
    const body = fields(input ?? {},['name']);
    return this.db.transaction(async db => {
      const row = await this.owned(db,user,id,true);
      const base = await this.cycle(db,user,row.cycle_id,true);
      // A historical duplicate is permitted while the original retains the reference.
      const cloneId = randomUUID(); const name = text(body.name ?? `${row.name.slice(0,180)} — cópia`,'Nome do orçamento');
      const document = this.document(parsed(row.data),cloneId,name,row.uf,row.regime);
      await db.query('INSERT INTO InfraProject(id,user_id,tenant_id,cycle_id,name,uf,regime,bdi,data) VALUES(?,?,?,?,?,?,?,?,?)',[cloneId,user.userId,user.tenantId,base.id,name,row.uf,row.regime,document.bdi,document.data]);
      const cloned = await this.owned(db,user,cloneId); await this.history(db,user,cloned);
      await this.audit(db,user,'project.duplicate','project',cloneId,{ originalId: id });
      return this.shape(cloned);
    });
  }
  async versions(user: AuthenticatedUser, id: string) {
    await this.owned(this.db as unknown as InfraSql,user,id);
    return { items: await this.db.query('SELECT version,created_at AS createdAt FROM InfraProjectVersion WHERE project_id=? ORDER BY version DESC',[id]) };
  }
  async restoreVersion(user: AuthenticatedUser, id: string, version: string, input: unknown) {
    const body = fields(input,['version']); const target = integer(/^\d+$/.test(version) ? Number(version) : version,'Versão histórica',1,2147483647);
    return this.db.transaction(async db => {
      const row = await this.owned(db,user,id,true); this.mismatch(row,body.version);
      const versions = await db.query('SELECT gz_blob FROM InfraProjectVersion WHERE project_id=? AND version=?',[id,target]) as any[];
      if (!versions[0]) throw new NotFoundException('Versão histórica não encontrada.');
      const saved = JSON.parse(gunzipSync(versions[0].gz_blob,{ maxOutputLength: 21 * 1024 * 1024 }).toString('utf8'));
      // Ownership was proven by the parent project and its stored server-built
      // version. Its archived cycle need not remain a current project binding.
      const cycleId = uuid(saved.cycleId);
      const historical = await db.query('SELECT * FROM InfraCycle WHERE id=? AND import_status=\'PASSED\' AND status IN (\'PUBLISHED\',\'ARCHIVED\')',[cycleId]) as CycleRow[];
      if (!historical[0]) throw new NotFoundException('Referência da versão histórica não está disponível.');
      return this.update(db,user,row,{ ...saved,version: body.version },'project.restore',cycleId,historical[0]);
    });
  }
  async migrateProject(user: AuthenticatedUser, id: string, input: unknown) {
    const body = fields(input,['cycleId','version','dryRun','confirmationToken']);
    if (body.dryRun != null && typeof body.dryRun !== 'boolean') throw new BadRequestException('Modo de simulação inválido.');
    const targetId = uuid(body.cycleId);
    return this.db.transaction(async db => {
      const row = await this.owned(db,user,id,true); this.mismatch(row,body.version);
      if (targetId === row.cycle_id) throw new BadRequestException('Selecione outra referência SICRO.');
      const target = await this.cycle(db,user,targetId);
      const rows = await db.query('SELECT cycle_id,gz_blob FROM InfraCycleSnapshot WHERE cycle_id IN (?,?)',[row.cycle_id,targetId]) as any[];
      const sourceRow = rows.find(item => item.cycle_id === row.cycle_id), targetRow = rows.find(item => item.cycle_id === targetId);
      if (!sourceRow || !targetRow) throw new NotFoundException('Snapshots de migração ausentes.');
      const modulePath = join(__dirname,'assets','migration-worker.cjs');
      if (!existsSync(modulePath)) throw new ConflictException('Motor de conferência ainda não disponível neste build.');
      // The exact legacy calculation is loaded without rewriting formulas.
      const oldRaw = JSON.parse(gunzipSync(sourceRow.gz_blob,{ maxOutputLength: 40 * 1024 * 1024 }).toString('utf8'));
      const newRaw = JSON.parse(gunzipSync(targetRow.gz_blob,{ maxOutputLength: 40 * 1024 * 1024 }).toString('utf8'));
      const libraries = await db.query('SELECT cycle_id,gz_blob FROM InfraPemSnapshot WHERE cycle_id IN (?,?)',[row.cycle_id,targetId]) as any[];
      const pem = (cycleId: string) => { const found = libraries.find(item => item.cycle_id === cycleId); return found ? JSON.parse(gunzipSync(found.gz_blob,{ maxOutputLength: 20 * 1024 * 1024 }).toString('utf8')) : undefined; };
      const targetUf = Array.isArray(newRaw.ufs) && newRaw.ufs.includes(row.uf) ? row.uf : target.uf;
      if (this.comparisonRunning) throw new ServiceUnavailableException('Outra comparação SICRO está em execução. Aguarde antes de tentar novamente.');
      this.comparisonRunning = true;
      let report: any;
      try {
        report = await new Promise<any>((resolve,reject) => {
          const worker = new Worker(modulePath,{ workerData: { oldRaw,newRaw,project: parsed(row.data),targetUf,oldPem: pem(row.cycle_id),newPem: pem(targetId) },resourceLimits: { maxOldGenerationSizeMb: 256 } });
          let settled = false;
          const finish = (error?: Error,value?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); void worker.terminate(); if (error) reject(error); else resolve(value); };
          const timer = setTimeout(() => finish(new BadRequestException('A comparação excedeu o tempo permitido. Reduza o projeto ou reveja sua estrutura.')),35000);
          worker.once('message',(message: any) => message?.ok === true ? finish(undefined,message.report) : finish(new BadRequestException('Não foi possível comparar as referências com o motor original.')));
          worker.once('error',() => finish(new BadRequestException('Falha no processo de comparação SICRO.')));
          worker.once('exit',(code: number) => { if (!settled) finish(new BadRequestException(`A comparação SICRO foi interrompida (${code}).`)); });
        });
      } finally { this.comparisonRunning = false; }
      const fingerprint = sha(json({ id: row.id,version: row.version,source: row.cycle_id,target: targetId,userId: user.userId,tenantId: user.tenantId,report },20 * 1024 * 1024));
      const secret = this.config.get<string>('INFRA_CSRF_SECRET') || this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
      const sign = (expires: string) => createHmac('sha256',secret).update(`infra:migrate:v1:${fingerprint}:${expires}`).digest('hex');
      if (body.dryRun !== false) {
        const expires = String(Date.now() + 10 * 60000);
        return { dryRun: true,projectId: id,version: row.version,sourceCycleId: row.cycle_id,targetCycleId: targetId,target: { uf: target.uf,ref: target.ref },report,confirmationToken: `${expires}.${sign(expires)}` };
      }
      const token = text(body.confirmationToken,'Confirmação da comparação',100), pieces = token.split('.');
      if (pieces.length !== 2 || !/^\d{13}$/.test(pieces[0]) || !/^[a-f0-9]{64}$/.test(pieces[1]) || Number(pieces[0]) < Date.now() || Number(pieces[0]) > Date.now() + 10 * 60000 || !timingSafeEqual(Buffer.from(pieces[1]),Buffer.from(sign(pieces[0])))) throw new ConflictException('Faça a comparação novamente antes de confirmar a migração.');
      if (report.items.some((item: any) => item.newUnitCostCents == null || item.newDirectCents == null)) throw new ConflictException('A referência de destino contém preços ausentes. Resolva as pendências antes de confirmar.');
      const result = await this.update(db,user,row,{ version: row.version,name: row.name,uf: targetUf,regime: row.regime,data: { ...parsed(row.data),sicroCycleId: targetId } },'project.migrate-cycle',targetId);
      await this.audit(db,user,'project.migration.comparison','project',id,{ sourceCycleId: row.cycle_id,targetCycleId: targetId,fingerprint,report });
      return { ...result,report };
    });
  }
  async ownRecords(user: AuthenticatedUser, kind: 'INPUT'|'COMPOSITION') {
    const rows = await this.db.query<any[]>('SELECT code,data,revision,updated_at AS updatedAt FROM InfraOwnRecord WHERE tenant_id=? AND user_id=? AND kind=? AND deleted_at IS NULL ORDER BY code LIMIT 10000',[user.tenantId,user.userId,kind]);
    return { items: rows.map(row => ({ ...row,data: parsed(row.data) })) };
  }
  async ownSave(user: AuthenticatedUser, kind: 'INPUT'|'COMPOSITION', code: string|undefined, input: unknown) {
    const body = fields(input,['code','data','revision']); const identifier = text(code ?? body.code,'Código próprio',100);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(identifier)) throw new BadRequestException('Código próprio inválido.');
    const encoded = json(body.data,2 * 1024 * 1024,true);
    return this.db.transaction(async db => {
      const rows = await db.query('SELECT revision FROM InfraOwnRecord WHERE tenant_id=? AND user_id=? AND kind=? AND code=? FOR UPDATE',[user.tenantId,user.userId,kind,identifier]) as any[];
      if (rows[0]) {
        if (integer(body.revision,'Revisão',1,2147483647) !== rows[0].revision) throw new ConflictException({ message: 'Cadastro próprio foi alterado. Atualize antes de salvar.', currentRevision: rows[0].revision });
        await db.query('UPDATE InfraOwnRecord SET data=?,revision=revision+1,deleted_at=NULL WHERE tenant_id=? AND user_id=? AND kind=? AND code=?',[encoded,user.tenantId,user.userId,kind,identifier]);
      } else {
        if (body.revision != null && body.revision !== 0) throw new ConflictException('Cadastro próprio não existe nesta revisão.');
        await db.query('INSERT INTO InfraOwnRecord(tenant_id,user_id,kind,code,data) VALUES(?,?,?,?,?)',[user.tenantId,user.userId,kind,identifier,encoded]);
      }
      await this.audit(db,user,'own.save',kind,identifier,{ revision: (rows[0]?.revision ?? 0) + 1 });
      return { code: identifier,data: JSON.parse(encoded),revision: (rows[0]?.revision ?? 0) + 1 };
    });
  }
  async ownDelete(user: AuthenticatedUser, kind: 'INPUT'|'COMPOSITION', code: string, input: unknown) {
    const body = fields(input,['revision']); const revision = integer(body.revision,'Revisão',1,2147483647);
    const result = await this.db.query<any>('UPDATE InfraOwnRecord SET deleted_at=CURRENT_TIMESTAMP(3),revision=revision+1 WHERE tenant_id=? AND user_id=? AND kind=? AND code=? AND revision=? AND deleted_at IS NULL',[user.tenantId,user.userId,kind,text(code,'Código',100),revision]);
    if (Number(result.affectedRows) !== 1) throw new ConflictException('Cadastro não encontrado ou alterado em outra operação.');
    await this.audit(this.db as unknown as InfraSql,user,'own.archive',kind,code);
    return { code,revision: revision + 1,deleted: true };
  }
  async settings(user: AuthenticatedUser) {
    const rows = await this.db.query<any[]>('SELECT name,data FROM InfraSetting WHERE tenant_id=? AND user_id=?',[user.tenantId,user.userId]);
    return Object.fromEntries(rows.map(row => [row.name,parsed(row.data)]));
  }
  async setting(user: AuthenticatedUser, input: unknown) {
    const body = fields(input,['id','v']); const name = text(body.id,'Configuração',100), encoded = json(body.v,2 * 1024 * 1024,true);
    if (['__proto__','constructor','prototype'].includes(name)) throw new BadRequestException('Nome de configuração não permitido.');
    await this.db.query('INSERT INTO InfraSetting(tenant_id,user_id,name,data) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',[user.tenantId,user.userId,name,encoded]);
    return { id: name,v: JSON.parse(encoded) };
  }
  async createCycle(user: AuthenticatedUser, input: unknown) {
    const body = fields(input,['uf','ref','expectedChunks','expectedBytes','contentHash','files']);
    const { uf } = context(body.uf,'SD'); const ref = reference(body.ref), count = integer(body.expectedChunks,'Quantidade de lotes',1,1000);
    const size = integer(body.expectedBytes,'Tamanho do SICRO',1,40 * 1024 * 1024), contentHash = digest(body.contentHash), id = randomUUID();
    return this.db.transaction(async db => {
      try { await db.query('INSERT INTO InfraCycle(id,uf,ref,imported_by,content_hash,raw_size,expected_chunks,files) VALUES(?,?,?,?,?,?,?,?)',[id,uf,ref,user.userId,contentHash,size,count,body.files ? json(body.files,1 * 1024 * 1024) : null]); }
      catch (error) { if ((error as any)?.code === 'ER_DUP_ENTRY') throw new ConflictException('Esta UF e referência SICRO já foram importadas.'); throw error; }
      await this.audit(db,user,'cycle.create','cycle',id,{ uf,ref,contentHash });
      return { id,uf,ref,status: 'DRAFT',importStatus: 'UPLOADING' };
    });
  }
  async cycleChunk(user: AuthenticatedUser, id: string, input: unknown) {
    const body = fields(input,['index','dataBase64','sha256','encoding']);
    json(body,2 * 1024 * 1024);
    const index = integer(body.index,'Índice do lote',0,999), hashValue = digest(body.sha256);
    const encoded = text(body.dataBase64,'Dados do lote',2 * 1024 * 1024);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new BadRequestException('Lote base64 inválido.');
    let data: Buffer = Buffer.from(encoded,'base64');
    if (body.encoding === 'gzip') { try { data = gunzipSync(data,{ maxOutputLength: 2 * 1024 * 1024 }); } catch { throw new BadRequestException('Lote gzip inválido ou descompactado excede 2 MB.'); } }
    else if (body.encoding != null && body.encoding !== 'utf8') throw new BadRequestException('Codificação de lote inválida.');
    if (data.length > 2 * 1024 * 1024 || sha(data) !== hashValue) throw new BadRequestException('Tamanho ou hash do lote divergente.');
    return this.db.transaction(async db => {
      const cycles = await db.query('SELECT status,import_status,expected_chunks,raw_size FROM InfraCycle WHERE id=? FOR UPDATE',[uuid(id)]) as any[];
      if (!cycles[0]) throw new NotFoundException('Referência não encontrada.');
      if (cycles[0].status !== 'DRAFT' || cycles[0].import_status !== 'UPLOADING' || index >= cycles[0].expected_chunks) throw new ConflictException('Referência não aceita este lote.');
      const previous = await db.query('SELECT sha256 FROM InfraCycleChunk WHERE cycle_id=? AND seq=?',[id,index]) as any[];
      if (previous[0]) { if (previous[0].sha256 !== hashValue) throw new ConflictException('Este índice já contém outro lote.'); return { received: true,index,reused: true }; }
      const size = await db.query('SELECT COALESCE(SUM(raw_size),0) AS total FROM InfraCycleChunk WHERE cycle_id=?',[id]) as any[];
      if (BigInt(size[0].total) + BigInt(data.length) > BigInt(cycles[0].raw_size)) throw new BadRequestException('Os lotes excedem o tamanho declarado da referência.');
      await db.query('INSERT INTO InfraCycleChunk(cycle_id,seq,sha256,raw_size,data) VALUES(?,?,?,?,?)',[id,index,hashValue,data.length,data]);
      return { received: true,index };
    });
  }
  async finalizeCycle(user: AuthenticatedUser, id: string) {
    return this.db.transaction(async db => {
      const cycles = await db.query('SELECT status,import_status,expected_chunks,raw_size FROM InfraCycle WHERE id=? FOR UPDATE',[uuid(id)]) as any[];
      if (!cycles[0]) throw new NotFoundException('Referência não encontrada.');
      if (cycles[0].status !== 'DRAFT' || cycles[0].import_status !== 'UPLOADING') throw new ConflictException('Referência já finalizada ou em processamento.');
      const sizes = await db.query('SELECT COUNT(*) AS count,COALESCE(SUM(raw_size),0) AS size,MIN(seq) AS first,MAX(seq) AS last FROM InfraCycleChunk WHERE cycle_id=?',[id]) as any[];
      const sums = sizes[0];
      if (BigInt(sums.count) !== BigInt(cycles[0].expected_chunks) || BigInt(sums.size) !== BigInt(cycles[0].raw_size) || Number(sums.first) !== 0 || Number(sums.last) !== cycles[0].expected_chunks - 1) throw new BadRequestException('Há lotes ausentes ou tamanho divergente.');
      // Processing is performed by the scheduled CLI, never in this HTTP request.
      await db.query('UPDATE InfraCycle SET import_status=\'QUEUED\',validation=? WHERE id=?',[json({ status: 'QUEUED',message: 'Aguardando conferência do motor original no cron.' }),id]);
      await this.audit(db,user,'cycle.finalize','cycle',id);
      return { id,importStatus: 'QUEUED',message: 'Lotes recebidos; a conferência será executada pelo cron.' };
    });
  }
  async cycleState(user: AuthenticatedUser, id: string, action: 'publish'|'archive'|'delete') {
    return this.db.transaction(async db => {
      const cycles = await db.query('SELECT * FROM InfraCycle WHERE id=? FOR UPDATE',[uuid(id)]) as CycleRow[];
      const cycle = cycles[0]; if (!cycle) throw new NotFoundException('Referência não encontrada.');
      if (action === 'publish') {
        if (cycle.status !== 'DRAFT' || cycle.import_status !== 'PASSED') throw new ConflictException('Publique somente uma referência em rascunho integralmente conferida.');
        const rows = await db.query('SELECT cycle_id FROM InfraCycleSnapshot WHERE cycle_id=?',[id]) as any[];
        if (!rows[0]) throw new ConflictException('Snapshot validado ausente.');
        await db.query('UPDATE InfraCycle SET status=\'PUBLISHED\',published_at=CURRENT_TIMESTAMP(3) WHERE id=?',[id]);
      } else if (action === 'archive') {
        if (cycle.status !== 'PUBLISHED') throw new ConflictException('Somente uma referência publicada pode ser arquivada.');
        await db.query('UPDATE InfraCycle SET status=\'ARCHIVED\' WHERE id=?',[id]);
      } else {
        const used = await db.query('SELECT COUNT(*) AS total FROM InfraProject WHERE cycle_id=?',[id]) as any[];
        if (BigInt(used[0].total) > 0n || cycle.status !== 'DRAFT' || ['PROCESSING','QUEUED'].includes(cycle.import_status)) throw new ConflictException('Referência publicada, em uso ou em processamento não pode ser excluída.');
        await db.query('DELETE FROM InfraPemSnapshot WHERE cycle_id=?',[id]); await db.query('DELETE FROM InfraPem WHERE cycle_id=?',[id]); await db.query('DELETE FROM InfraCycleSnapshot WHERE cycle_id=?',[id]);
        await db.query('DELETE FROM InfraCycle WHERE id=?',[id]);
      }
      await this.audit(db,user,`cycle.${action}`,'cycle',id);
      return { id,status: action === 'publish' ? 'PUBLISHED' : action === 'archive' ? 'ARCHIVED' : 'DELETED' };
    });
  }
  async policies() {
    const rows = await this.db.query<any[]>('SELECT name,data,version,updated_at AS updatedAt FROM InfraPolicy WHERE name IN (\'privacy\',\'terms\')');
    return { items: rows.map(row => ({ ...row,data: parsed(row.data) })) };
  }
  async savePolicy(user: AuthenticatedUser, name: string, input: unknown) {
    if (!['privacy','terms'].includes(name)) throw new BadRequestException('Política inválida.');
    const body = fields(input,['text','version']); const value = text(body.text,'Texto da política',100000);
    return this.db.transaction(async db => {
      const old = await db.query('SELECT version FROM InfraPolicy WHERE name=? FOR UPDATE',[name]) as any[];
      if (old[0] && body.version !== old[0].version) throw new ConflictException('Política alterada. Recarregue.');
      await db.query('INSERT INTO InfraPolicy(name,data,updated_by) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_by=VALUES(updated_by),version=version+1',[name,json({ text: value },1 * 1024 * 1024,true),user.userId]);
      await this.audit(db,user,'policy.update','policy',name);
      return { name,version: (old[0]?.version ?? 0) + 1 };
    });
  }
  async logs(query: InfraObject) {
    const current = page(query.page), limit = page(query.pageSize,50,100);
    return { items: await this.db.query('SELECT id,tenant_id AS tenantId,user_id AS userId,action,entity,entity_id AS entityId,payload,created_at AS createdAt FROM InfraAudit ORDER BY created_at DESC,id LIMIT ? OFFSET ?',[limit,(current - 1) * limit]),page: current,pageSize: limit };
  }
  async stats() {
    const users = await this.db.query<any[]>('SELECT status,COUNT(*) AS count FROM InfraUser GROUP BY status');
    const projects = await this.db.query<any[]>('SELECT COUNT(*) AS total,COALESCE(SUM(OCTET_LENGTH(data)),0) AS bytes FROM InfraProject');
    const cycles = await this.db.query<any[]>('SELECT status,COUNT(*) AS count FROM InfraCycle GROUP BY status');
    return { users: users.map(row => ({ ...row,count: Number(row.count) })),projects: { total: Number(projects[0].total),bytes: String(projects[0].bytes) },cycles: cycles.map(row => ({ ...row,count: Number(row.count) })) };
  }
  async users() { return { items: await this.db.query('SELECT id,external_user_id AS userId,tenant_id AS tenantId,name,email,role,status,created_at AS createdAt,deleted_at AS deletedAt FROM InfraUser ORDER BY name LIMIT 1000') }; }
  async accounts(query: InfraObject) {
    const search = typeof query.search === 'string' ? text(query.search,'Busca',200,true) : '';
    const current = page(query.page), limit = 30;
    // Prisma's MariaDB contains filter can compare a unicode column to a binary
    // parameter (MySQL 1267). Normalize only this comparison, without changing
    // stored identity data or weakening the membership eligibility filters.
    const matches = search ? await this.primary.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM User WHERE deletedAt IS NULL AND status = 'ACTIVE' AND (
        LOCATE(CONVERT(${search} USING utf8mb4) COLLATE utf8mb4_unicode_ci, name COLLATE utf8mb4_unicode_ci) > 0 OR
        LOCATE(CONVERT(${search} USING utf8mb4) COLLATE utf8mb4_unicode_ci, email COLLATE utf8mb4_unicode_ci) > 0
      )`) : null;
    const where = { status: 'ACTIVE' as const,...(matches ? { userId: { in: matches.map(row => row.id) } } : {}),user: { deletedAt: null,status: 'ACTIVE' as const },tenant: { deletedAt: null,status: { in: ['TRIAL','ACTIVE','PAST_DUE'] as ('TRIAL'|'ACTIVE'|'PAST_DUE')[] } } };
    const [memberships,total] = await Promise.all([this.primary.tenantMembership.findMany({ where,select: { userId: true,tenantId: true,user: { select: { name: true,email: true } },tenant: { select: { name: true,slug: true } } },orderBy: [{ createdAt: 'asc' },{ id: 'asc' }],skip: (current - 1) * limit,take: limit }),this.primary.tenantMembership.count({ where })]);
    return { items: memberships.map(row => ({ userId: row.userId,tenantId: row.tenantId,name: row.user.name,email: row.user.email,organizationName: row.tenant.name,organizationSlug: row.tenant.slug })),total,page: current,pageSize: limit };
  }
  async createUser(user: AuthenticatedUser, input: unknown) {
    const body = fields(input,['name','email','password','organizationName','organizationSlug','role','status']);
    const name = text(body.name,'Nome',200), email = text(body.email,'E-mail',254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('E-mail inválido.');
    if (typeof body.password !== 'string' || body.password.length < 10 || Buffer.byteLength(body.password,'utf8') > 72) throw new BadRequestException('A senha deve ter 10 a 72 caracteres e até 72 bytes UTF-8.');
    const role = String(body.role ?? 'USER'), status = String(body.status ?? 'ACTIVE');
    if (!['ADMIN','USER'].includes(role) || !['ACTIVE','PENDING','BLOCKED'].includes(status)) throw new BadRequestException('Papel ou situação inválidos.');
    if (!!body.organizationName !== !!body.organizationSlug) throw new BadRequestException('Informe nome e identificador da nova organização juntos.');
    const slug = body.organizationSlug ? text(body.organizationSlug,'Identificador da organização',100).toLowerCase() : null;
    if (slug && !/^[a-z0-9][a-z0-9-]{2,99}$/.test(slug)) throw new BadRequestException('Identificador deve ter 3 a 100 letras minúsculas, números ou hífens.');
    const passwordHash = await hash(body.password,12), id = randomUUID(); let localCreated = false;
    try {
      const result = await this.primary.$transaction(async primary => {
        if (await primary.user.findUnique({ where: { email },select: { id: true } })) throw new ConflictException('Este e-mail já possui conta compartilhada. Use Conceder acesso à conta existente.');
        const tenant = slug
          ? await primary.tenant.create({ data: { name: text(body.organizationName,'Organização',200),slug,status: 'ACTIVE' } })
          : await primary.tenant.findFirst({ where: { id: user.tenantId,deletedAt: null,status: { in: ['TRIAL','ACTIVE','PAST_DUE'] } },select: { id: true,slug: true } });
        if (!tenant) throw new BadRequestException('Organização indisponível.');
        await primary.user.create({ data: { id,name,email,passwordHash,status: 'ACTIVE' } });
        await primary.tenantMembership.create({ data: { userId: id,tenantId: tenant.id,role: 'REQUESTER',status: 'ACTIVE',maintenanceAccess: false,acceptedAt: new Date() } });
        await primary.orcaproUserAccess.create({ data: { userId: id,enabled: false,managed: true,updatedByUserId: user.userId } });
        // The identity transaction has no operational writes. A failed second-database
        // provision rolls it back; a failed primary commit removes the orphan profile.
        await this.db.transaction(async local => {
          await local.query('INSERT INTO InfraUser(id,external_user_id,tenant_id,name,email,role,status) VALUES(?,?,?,?,?,?,?)',[randomUUID(),id,tenant.id,name,email,role,status]);
          await this.audit(local,user,'user.create','user',id,{ customerTenantId: tenant.id,maintenanceAccess: false,orcaproAccess: false,role,status });
        });
        localCreated = true;
        return { userId: id,tenantId: tenant.id,name,email,role,status,organizationSlug: tenant.slug };
      });
      return result;
    } catch (error) {
      if (localCreated) await this.db.query('DELETE FROM InfraUser WHERE external_user_id=?',[id]).catch(() => undefined);
      if ((error as any)?.code === 'P2002') throw new ConflictException('E-mail ou identificador de organização já cadastrado.');
      if (error instanceof HttpException) throw error;
      // Prisma diagnostics may include the identity write arguments. Do not
      // forward password hashes or connection details to Nest's error logger.
      throw new ServiceUnavailableException('Não foi possível concluir o cadastro na identidade compartilhada.');
    }
  }
  async grantUser(user: AuthenticatedUser, input: unknown) {
    const body = fields(input,['userId','tenantId','role','status']);
    const userId = uuid(body.userId), tenantId = uuid(body.tenantId);
    if (!['ADMIN','USER'].includes(String(body.role)) || !['ACTIVE','PENDING','BLOCKED'].includes(String(body.status))) throw new BadRequestException('Papel ou situação inválidos.');
    if (this.access.configuredAdmin(userId) && (body.role !== 'ADMIN' || body.status !== 'ACTIVE')) throw new ForbiddenException('Administrador inicial protegido.');
    const membership = await this.primary.tenantMembership.findFirst({ where: { userId,tenantId,status: 'ACTIVE',user: { deletedAt: null,status: 'ACTIVE' },tenant: { deletedAt: null } },include: { user: { select: { name: true,email: true } } } });
    if (!membership) throw new NotFoundException('Vínculo válido da conta compartilhada não encontrado.');
    return this.db.transaction(async db => {
      await db.query('INSERT INTO InfraUser(id,external_user_id,tenant_id,name,email,role,status) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),role=VALUES(role),status=VALUES(status),deleted_at=NULL,erasure_requested_at=NULL',[randomUUID(),userId,tenantId,membership.user.name,membership.user.email,body.role,body.status]);
      await this.audit(db,user,'user.grant','user',userId,{ customerTenantId: tenantId,role: body.role,status: body.status,sharedPassword: true });
      return { userId,tenantId,role: body.role,status: body.status };
    });
  }
  async deleteUser(user: AuthenticatedUser, id: string, input: unknown) {
    const body = fields(input,['tenantId']); const tenantId = uuid(body.tenantId), userId = uuid(id);
    if (this.access.configuredAdmin(userId) || userId === user.userId) throw new ForbiddenException('Administrador inicial e a própria conta são protegidos.');
    return this.db.transaction(async db => {
      const updated = await db.query('UPDATE InfraUser SET status=\'BLOCKED\',deleted_at=UTC_TIMESTAMP(3) WHERE external_user_id=? AND tenant_id=? AND deleted_at IS NULL',[userId,tenantId]) as any;
      if (Number(updated.affectedRows) !== 1) throw new NotFoundException('Conta Infraestrutura não encontrada.');
      await this.audit(db,user,'user.archive','user',userId,{ customerTenantId: tenantId,sharedIdentityPreserved: true,otherProductsPreserved: true });
      return { userId,tenantId,deleted: true,recoverable: true };
    });
  }
  async password(user: AuthenticatedUser, id: string, input: unknown) {
    const body = fields(input,['newPassword']); const password = body.newPassword;
    if (typeof password !== 'string' || password.length < 10 || password.length > 72 || Buffer.byteLength(password,'utf8') > 72) throw new BadRequestException('Senha deve ter 10 a 72 caracteres e até 72 bytes UTF-8.');
    uuid(id); if (this.access.configuredAdmin(id) || id === user.userId) throw new ForbiddenException('Use o fluxo da própria conta para alterar esta senha.');
    const target = await this.db.query<any[]>('SELECT external_user_id FROM InfraUser WHERE external_user_id=? AND deleted_at IS NULL LIMIT 1',[id]);
    if (!target[0]) throw new NotFoundException('Conta Infraestrutura não encontrada.');
    const passwordHash = await hash(password,12), operationId = randomUUID();
    // An intent is durable in the product DB before touching the shared identity.
    // The authoritative completion audit commits with the password and session
    // revocation in the identity DB; no distributed transaction is implied.
    await this.audit(this.db as unknown as InfraSql,user,'user.password.request','user',id,{ operationId,sharedPassword: true });
    try { await this.primary.$transaction(async db => {
      await db.user.update({ where: { id },data: { passwordHash } });
      await db.refreshSession.updateMany({ where: { userId: id,revokedAt: null },data: { revokedAt: new Date() } });
      await db.tenantMembership.updateMany({ where: { userId: id },data: { sessionVersion: { increment: 1 } } });
      await db.accountToken.updateMany({ where: { userId: id,purpose: 'PASSWORD_RESET',consumedAt: null },data: { consumedAt: new Date() } });
      await db.auditLog.create({ data: { tenantId: user.tenantId,actorUserId: user.userId,action: 'UPDATE',entityType: 'InfraSharedIdentity',entityId: id,afterData: { operationId,sharedPasswordChanged: true,sessionsRevoked: true } } });
    }); } catch (error) {
      await this.audit(this.db as unknown as InfraSql,user,'user.password.failed','user',id,{ operationId,sharedPassword: true }).catch(() => undefined);
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Não foi possível alterar a senha na identidade compartilhada.');
    }
    let localAuditPending = false;
    await this.audit(this.db as unknown as InfraSql,user,'user.password','user',id,{ operationId,sharedPassword: true,sessionsRevoked: true }).catch(() => { localAuditPending = true; });
    return { passwordUpdated: true,sessionsRevoked: true,sharedPassword: true,localAuditPending };
  }
  async exportPersonal(user: AuthenticatedUser) {
    const projects = await this.db.query<ProjectRow[]>('SELECT * FROM InfraProject WHERE user_id=? AND tenant_id=?',[user.userId,user.tenantId]);
    await this.audit(this.db as unknown as InfraSql,user,'lgpd.export','user',user.userId);
    return { product: 'OrçaPro Infraestrutura',exportedAt: new Date().toISOString(),user: { name: user.name,email: user.email },projects: projects.map(row => this.shape(row)),inputs: await this.ownRecords(user,'INPUT'),compositions: await this.ownRecords(user,'COMPOSITION'),settings: await this.settings(user),completeArchiveEndpoint: '/api/v1/infraestrutura/me/export/archive',historyIncludedInArchive: true,deletedRecordsIncludedInArchive: true };
  }
  async exportArchive(user: AuthenticatedUser): Promise<Readable> {
    await this.audit(this.db as unknown as InfraSql,user,'lgpd.export.complete','user',user.userId);
    const db = this.db, shape = (row: ProjectRow) => this.shape(row);
    async function* collection(sql: string, parameters: unknown[], mapper: (row: any) => unknown) {
      let offset = 0;
      for (;;) {
        const rows = await db.query<any[]>(sql + ' LIMIT 1 OFFSET ?',[...parameters,offset++]);
        if (!rows[0]) break;
        yield (offset > 1 ? ',' : '') + JSON.stringify(mapper(rows[0]));
      }
    }
    async function* bytes() {
      yield `{"product":"OrçaPro Infraestrutura","exportedAt":${JSON.stringify(new Date().toISOString())},"scope":"dados da identidade e organização autenticadas neste programa","user":${JSON.stringify({ name: user.name,email: user.email })},"projects":[`;
      yield* collection('SELECT * FROM InfraProject WHERE user_id=? AND tenant_id=? ORDER BY id',[user.userId,user.tenantId],shape);
      yield '],"projectVersions":[';
      yield* collection('SELECT v.project_id,v.version,v.gz_blob,v.created_at FROM InfraProjectVersion v JOIN InfraProject p ON p.id=v.project_id WHERE p.user_id=? AND p.tenant_id=? ORDER BY v.project_id,v.version',[user.userId,user.tenantId],row => ({ projectId: row.project_id,version: row.version,createdAt: row.created_at,data: JSON.parse(gunzipSync(row.gz_blob,{ maxOutputLength: 21 * 1024 * 1024 }).toString('utf8')) }));
      yield '],"ownRecords":[';
      yield* collection('SELECT kind,code,data,revision,deleted_at,updated_at FROM InfraOwnRecord WHERE user_id=? AND tenant_id=? ORDER BY kind,code',[user.userId,user.tenantId],row => ({ ...row,data: parsed(row.data) }));
      yield '],"settings":[';
      yield* collection('SELECT name,data,updated_at FROM InfraSetting WHERE user_id=? AND tenant_id=? ORDER BY name',[user.userId,user.tenantId],row => ({ ...row,data: parsed(row.data) }));
      yield '],"audit":[';
      yield* collection('SELECT id,action,entity,entity_id,payload,created_at FROM InfraAudit WHERE user_id=? AND tenant_id=? ORDER BY created_at,id',[user.userId,user.tenantId],row => ({ ...row,payload: parsed(row.payload) }));
      yield ']}';
    }
    return Readable.from(bytes());
  }
  async deletePersonal(user: AuthenticatedUser, input: unknown) {
    const body = fields(input,['confirm']); if (body.confirm !== 'EXCLUIR MEUS DADOS') throw new BadRequestException('Confirme a exclusão com EXCLUIR MEUS DADOS.');
    if (this.access.configuredAdmin(user.userId)) throw new ForbiddenException('Transfira a administração inicial antes de encerrar a conta.');
    return this.db.transaction(async db => {
      await db.query('UPDATE InfraProject SET deleted_at=CURRENT_TIMESTAMP(3),version=version+1 WHERE user_id=? AND tenant_id=? AND deleted_at IS NULL',[user.userId,user.tenantId]);
      await db.query('UPDATE InfraOwnRecord SET deleted_at=CURRENT_TIMESTAMP(3),revision=revision+1 WHERE user_id=? AND tenant_id=? AND deleted_at IS NULL',[user.userId,user.tenantId]);
      await db.query('DELETE FROM InfraSetting WHERE user_id=? AND tenant_id=?',[user.userId,user.tenantId]);
      await db.query('UPDATE InfraUser SET status=\'BLOCKED\',deleted_at=CURRENT_TIMESTAMP(3) WHERE external_user_id=? AND tenant_id=?',[user.userId,user.tenantId]);
      await db.query('UPDATE InfraUser SET erasure_requested_at=UTC_TIMESTAMP(3) WHERE external_user_id=? AND tenant_id=?',[user.userId,user.tenantId]);
      await this.audit(db,user,'lgpd.deletion.request','user',user.userId,{ recoverable: true,otherProductsPreserved: true });
      const supplied = Number(this.config.get<string>('INFRA_DELETED_DATA_RETENTION_DAYS') ?? 30);
      const days = Number.isInteger(supplied) && supplied >= 1 && supplied <= 365 ? supplied : 30;
      return { requested: true,accessRevoked: true,retentionDays: days,scheduledErasureAt: new Date(Date.now() + days * 86400000).toISOString(),message: `Acesso encerrado neste programa. Projetos, versões e cadastros serão eliminados pelo cron após ${days} dias; auditoria terá conteúdo e referências pessoais anonimizados. A identidade compartilhada e os outros programas são preservados. Backups expiram após sua retenção de 14 dias.` };
    });
  }
}

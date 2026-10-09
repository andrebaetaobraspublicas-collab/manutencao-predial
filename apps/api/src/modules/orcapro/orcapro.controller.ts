import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproService } from './orcapro.service';
import { OrcaproAccess, OrcaproAdmin, OrcaproGuard } from './orcapro.guard';
import { AdaptCompositionDto, AdminListQuery, BundleQuery, CatalogQuery, CloneTemplateDto, ContextQuery, CreateProjectDto, CustomRecordDto, ImportSinapiDto, ImportSinapiFileDto, ImportReportQuery, ProjectListQuery, ReferenceDto, RestoreDto, RevisionDto, SaveProjectDto, UserAccessDto } from './orcapro.dto';
import { codeList } from './orcapro-domain';

@ApiTags('OrçaPro')
@ApiCookieAuth('gp_access')
@ApiBearerAuth()
@UseGuards(OrcaproGuard)
@Controller('orcapro')
export class OrcaproController {
  constructor(private readonly service: OrcaproService, private readonly access: OrcaproAccess) {}

  @Get('access') @ApiOperation({ summary: 'Acesso OrçaPro e papel global independente do papel de manutenção.' })
  session(@CurrentUser() user: AuthenticatedUser) { return this.access.session(user); }
  @Post('workspace/open') @ApiOperation({ summary: 'Retoma o orçamento privado mais recente; na primeira entrada cria uma única cópia privada do exemplo inicial.' })
  openWorkspace(@CurrentUser() user: AuthenticatedUser) { return this.service.openWorkspace(user); }
  @Get('references') references(@CurrentUser() user: AuthenticatedUser) { return this.service.references(user); }
  @Get('catalog/navigation') @ApiOperation({ summary: 'Índice global de cadernos e descrições para navegação original; sem preços ou analíticos.' })
  navigation(@Query() dto: ReferenceDto) { return this.service.catalogNavigation(dto.referenceId); }
  @Get('catalog/inputs') inputs(@Query() dto: CatalogQuery) { return this.service.catalogInputs(dto); }
  @Get('catalog/compositions') compositions(@Query() dto: CatalogQuery) { return this.service.catalogCompositions(dto); }
  @Get('catalog/compositions/:code') analytic(@Param('code') code: string, @Query() dto: ContextQuery) { return this.service.composition(code, dto.referenceId, dto.uf, dto.regime); }
  @Get('catalog/bundle') @ApiOperation({ summary: 'Grafo analítico sob demanda; no máximo 500 raízes oficiais.' })
  bundle(@Query() dto: BundleQuery) { return this.service.bundle(dto.referenceId, codeList(dto.codes), codeList(dto.inputCodes), dto.uf, dto.regime); }

  @Get('projects') projects(@CurrentUser() user: AuthenticatedUser, @Query() dto: ProjectListQuery) { return this.service.projects(user, dto.archived === 'true'); }
  @Post('projects') create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) { return this.service.createProject(user, dto); }
  @Post('projects/import') @ApiOperation({ summary: 'Importar documento legado; referência histórica obrigatória e explícita.' })
  importProject(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) { return this.service.importLegacyProject(user, dto); }
  @Get('projects/:id') project(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.project(user, id); }
  @Get('projects/:id/context') context(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.projectContext(user, id); }
  @Get('projects/:id/calculation') calculate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.calculation(user, id); }
  @Get('projects/:id/export') exportProject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.exportProject(user, id); }
  @Put('projects/:id') save(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SaveProjectDto) { return this.service.saveProject(user, id, dto); }
  @Delete('projects/:id') archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RevisionDto) { return this.service.archiveProject(user, id, dto.expectedVersion); }
  @Post('projects/:id/unarchive') unarchive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RevisionDto) { return this.service.unarchiveProject(user, id, dto.expectedVersion); }
  @Get('projects/:id/versions') versions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.versions(user, id); }
  @Post('projects/:id/restore') restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RestoreDto) { return this.service.restore(user, id, dto.version, dto.expectedVersion); }

  @Get('templates') templates() { return this.service.templates(); }
  @Post('templates/:id/clone') clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CloneTemplateDto) { return this.service.cloneTemplate(user, id, dto); }
  @OrcaproAdmin() @Put('templates/:id') updateTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SaveProjectDto) { return this.service.updateTemplate(user, id, dto); }
  @Get('custom-compositions') customs(@CurrentUser() user: AuthenticatedUser) { return this.service.customCompositions(user); }
  @Get('custom-inputs') customInputs(@CurrentUser() user: AuthenticatedUser) { return this.service.customInputs(user); }
  @Post('custom-compositions') saveCustomComp(@CurrentUser() user: AuthenticatedUser, @Body() dto: CustomRecordDto) { return this.service.saveCustom(user, 'C', dto.data); }
  @Post('custom-inputs') saveCustomInput(@CurrentUser() user: AuthenticatedUser, @Body() dto: CustomRecordDto) { return this.service.saveCustom(user, 'I', dto.data); }
  @Post('custom-compositions/from-sinapi/:code') adapt(@CurrentUser() user: AuthenticatedUser, @Param('code') code: string, @Body() dto: AdaptCompositionDto) { return this.service.adaptComposition(user, code, dto); }

  @OrcaproAdmin() @Get('admin/references') adminReferences(@CurrentUser() user: AuthenticatedUser) { return this.service.references(user, true); }
  @OrcaproAdmin() @Post('admin/imports') @ApiOperation({ summary: 'Importação SINAPI transacional em DRAFT; não substitui referências publicadas.' })
  import(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportSinapiDto) { return this.service.importSinapi(user, dto, undefined, { baselineReferenceId: dto.baselineReferenceId }); }
  @OrcaproAdmin() @Post('admin/imports/file') @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object',required: ['file'],properties: { file: { type: 'string',format: 'binary' },revision: { type: 'integer',minimum: 1,default: 1 }, baselineReferenceId: { type: 'string',format: 'uuid' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1, fields: 2 } }))
  importFile(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportSinapiFileDto, @UploadedFile() file?: Express.Multer.File) { return this.service.importSinapiFile(user, file, dto.revision, { baselineReferenceId: dto.baselineReferenceId }); }
  private async streamImport(response: Response, work: (progress: (phase: string, percent: number) => void) => Promise<unknown>) {
    response.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    response.flushHeaders();
    const send = (event: unknown) => { if (!response.destroyed && !response.writableEnded) response.write(JSON.stringify(event) + '\n'); };
    let last = 0, phase = '', percent = 0;
    const progress = (nextPhase: string, nextPercent: number) => {
      const next = Math.max(percent, Math.min(100, Math.round(nextPercent * 10) / 10));
      if (phase !== nextPhase || next === 100 || Date.now() - last > 150) { phase = nextPhase; percent = next; last = Date.now(); send({ type: 'progress', phase, percent }); }
    };
    send({ type: 'progress', phase: 'Arquivo recebido. Iniciando conferência', percent: 1 });
    const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 15000);
    try { send({ type: 'result', result: await work(progress) }); }
    catch (cause) {
      const status = cause instanceof HttpException ? cause.getStatus() : 500;
      send({ type: 'error', status, message: cause instanceof HttpException ? cause.message : 'Não foi possível concluir a gravação. Confira as referências importadas antes de tentar novamente.' });
    } finally { clearInterval(heartbeat); if (!response.destroyed && !response.writableEnded) response.end(); }
  }
  @OrcaproAdmin() @Post('admin/imports/file/stream') @ApiConsumes('multipart/form-data') @ApiProduces('application/x-ndjson')
  @ApiOperation({ summary: 'Importar XLSX com progresso real por leitura/lote, resultado somente após commit. Nenhuma publicação automática.' })
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, revision: { type: 'integer', minimum: 1 }, baselineReferenceId: { type: 'string', format: 'uuid' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1, fields: 2 } }))
  streamFile(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportSinapiFileDto, @UploadedFile() file: Express.Multer.File | undefined, @Res() response: Response) {
    return this.streamImport(response, onProgress => this.service.importSinapiFile(user, file, dto.revision, { onProgress, baselineReferenceId: dto.baselineReferenceId }));
  }
  @OrcaproAdmin() @Post('admin/imports/stream') @ApiProduces('application/x-ndjson')
  @ApiOperation({ summary: 'Importar raw SINAPI JSON com progresso e comparação de referências.' })
  streamJson(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportSinapiDto, @Res() response: Response) {
    return this.streamImport(response, onProgress => this.service.importSinapi(user, dto, undefined, { onProgress, baselineReferenceId: dto.baselineReferenceId }));
  }
  @OrcaproAdmin() @Get('admin/references/:id/import-report') @ApiOperation({ summary: 'Resumo persistente e diferenças paginadas da importação SINAPI.' })
  report(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() dto: ImportReportQuery) { return this.service.importReport(user, id, dto); }
  @OrcaproAdmin() @Get('admin/references/:id/import-report.csv') @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Exportar todas as diferenças filtradas, com proteção contra fórmulas CSV.' })
  async reportCsv(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() dto: ImportReportQuery, @Res() response: Response) {
    const csv = await this.service.importReport(user, id, dto, true);
    response.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="comparacao-sinapi.csv"', 'Cache-Control': 'no-store' }).send(csv);
  }
  @OrcaproAdmin() @Post('admin/references/:id/validate') validate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.validateReference(user, id); }
  @OrcaproAdmin() @Post('admin/references/:id/publish') publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.publishReference(user, id); }
  @OrcaproAdmin() @Post('admin/references/:id/archive') archiveReference(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.archiveReference(user, id); }
  @OrcaproAdmin() @Put('admin/default-reference') default(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReferenceDto) { return this.service.defaultReference(user, dto.referenceId); }
  @OrcaproAdmin() @Get('admin/logs') logs(@CurrentUser() user: AuthenticatedUser, @Query() dto: AdminListQuery) { return this.service.adminLogs(user, dto); }
  @OrcaproAdmin() @Get('admin/users') users(@CurrentUser() user: AuthenticatedUser, @Query() dto: AdminListQuery) { return this.service.adminUsers(user, dto); }
  @OrcaproAdmin() @Patch('admin/users/:id/access') userAccess(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UserAccessDto) { return this.service.setUserAccess(user, id, dto.enabled); }
}

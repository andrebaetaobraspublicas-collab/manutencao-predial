import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InfraAccess, InfraAdmin, InfraGuard, InfraProfileOptional } from './infra.guard';
import { InfraService } from './infra.service';
import type { InfraObject } from './infra-domain';

@ApiTags('OrçaPro Infraestrutura')
@ApiCookieAuth('gp_access')
@ApiBearerAuth()
@UseGuards(InfraGuard)
@Controller('infraestrutura')
export class InfraController {
  constructor(private readonly service: InfraService, private readonly access: InfraAccess) {}
  @InfraProfileOptional() @Get('access')
  @ApiOperation({ summary: 'Acesso individual Infraestrutura e bootstrap CSRF vinculado à sessão compartilhada.' })
  async session(@CurrentUser() user: AuthenticatedUser, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const profile = await this.access.principal(user);
    return { enabled: profile?.status === 'ACTIVE' && !profile.deleted_at,userId: user.userId,tenantId: user.tenantId,name: user.name,email: user.email,
      role: this.access.configuredAdmin(user.userId) ? 'ADMIN' : profile?.role ?? 'USER',status: profile?.status ?? 'PENDING',csrfToken: this.access.csrf(request,response) };
  }
  @InfraProfileOptional() @Get('me') me(@CurrentUser() user: AuthenticatedUser,@Req() request: Request,@Res({ passthrough: true }) response: Response) { return this.session(user,request,response); }
  @Post('workspace/open') open(@CurrentUser() user: AuthenticatedUser) { return this.service.openWorkspace(user); }
  @Get('cycles') cycles(@CurrentUser() user: AuthenticatedUser) { return this.service.cycles(user); }
  @Get('cycles/:id/snapshot')
  @ApiOperation({ summary: 'Snapshot global raw-v1 comprimido, ETag imutável por referência; não duplica catálogo por usuário.' })
  async snapshot(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Req() request: Request,@Res() response: Response) {
    const result = await this.service.snapshot(user,id); this.writeSnapshot(result,request,response);
  }
  @Get('cycles/:id/pem') async pemSnapshot(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Req() request: Request,@Res() response: Response) { this.writeSnapshot(await this.service.snapshot(user,id,true),request,response); }
  private writeSnapshot(result: { gzip: Buffer; etag: string },request: Request,response: Response) {
    const etag = `"${result.etag}"`; response.set({ ETag: etag,'Cache-Control': 'private, max-age=3600, immutable',Vary: 'Origin, Cookie' });
    if ((request.headers['if-none-match'] ?? '').split(',').map(value => value.trim()).includes(etag)) { response.status(304).end(); return; }
    response.set({ 'Content-Type': 'application/json; charset=utf-8','Content-Encoding': 'gzip','Content-Length': String(result.gzip.length) });
    response.status(200).end(result.gzip);
  }
  @Get('cycles/:id/compositions') compositions(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Query() query: InfraObject) { return this.service.compositions(user,id,query); }
  @Get('cycles/:id/pem/:code') pem(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Param('code') code: string) { return this.service.pem(user,id,code); }
  @Get('projects') projects(@CurrentUser() user: AuthenticatedUser,@Query('trash') trash?: string) { return this.service.projects(user,trash === 'true'); }
  @Post('projects') create(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.createProject(user,body); }
  @Get('projects/:id') project(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string) { return this.service.project(user,id); }
  @Put('projects/:id') save(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.saveProject(user,id,body); }
  @Delete('projects/:id') archive(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.archiveProject(user,id,body); }
  @Post('projects/:id/unarchive') unarchive(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.archiveProject(user,id,body,true); }
  @Post('projects/:id/duplicate') duplicate(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.duplicate(user,id,body); }
  @Get('projects/:id/versions') versions(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string) { return this.service.versions(user,id); }
  @Post('projects/:id/restore/:version') restore(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Param('version') version: string,@Body() body: InfraObject) { return this.service.restoreVersion(user,id,version,body); }
  @ApiOperation({ summary: 'Comparar/aplicar UF e referência SICRO', description: 'dryRun:true retorna custos, prazo e créditos de IBS/CBS/IVA com indicação de parcelas incompletas. A aplicação exige confirmationToken HMAC vinculado ao usuário, tenant, ciclos e versão; gera histórico e auditoria.' })
  @Post('projects/:id/migrate-cycle') migrate(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.migrateProject(user,id,body); }
  @Get('me/inputs') inputs(@CurrentUser() user: AuthenticatedUser) { return this.service.ownRecords(user,'INPUT'); }
  @Get('me/compositions') ownCompositions(@CurrentUser() user: AuthenticatedUser) { return this.service.ownRecords(user,'COMPOSITION'); }
  @Post('me/inputs') inputCreate(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.ownSave(user,'INPUT',undefined,body); }
  @Post('me/compositions') compositionCreate(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.ownSave(user,'COMPOSITION',undefined,body); }
  @Put('me/inputs/:code') inputSave(@CurrentUser() user: AuthenticatedUser,@Param('code') code: string,@Body() body: InfraObject) { return this.service.ownSave(user,'INPUT',code,body); }
  @Put('me/compositions/:code') compositionSave(@CurrentUser() user: AuthenticatedUser,@Param('code') code: string,@Body() body: InfraObject) { return this.service.ownSave(user,'COMPOSITION',code,body); }
  @Delete('me/inputs/:code') inputDelete(@CurrentUser() user: AuthenticatedUser,@Param('code') code: string,@Body() body: InfraObject) { return this.service.ownDelete(user,'INPUT',code,body); }
  @Delete('me/compositions/:code') compositionDelete(@CurrentUser() user: AuthenticatedUser,@Param('code') code: string,@Body() body: InfraObject) { return this.service.ownDelete(user,'COMPOSITION',code,body); }
  @Get('settings') settings(@CurrentUser() user: AuthenticatedUser) { return this.service.settings(user); }
  @Put('settings') setting(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.setting(user,body); }
  @Get('policies') policies() { return this.service.policies(); }
  @Get('me/export') exportPersonal(@CurrentUser() user: AuthenticatedUser,@Res({ passthrough: true }) response: Response) { response.setHeader('Cache-Control','no-store'); return this.service.exportPersonal(user); }
  @Get('me/export/archive')
  @ApiOperation({ summary: 'Exportação LGPD completa em JSON gzip por fluxo: projetos/lixeira, versões, cadastros, configurações e auditoria próprios.' })
  async archivePersonal(@CurrentUser() user: AuthenticatedUser,@Res() response: Response) {
    const stream = await this.service.exportArchive(user);
    response.set({ 'Cache-Control': 'no-store','Content-Type': 'application/gzip','Content-Disposition': 'attachment; filename="orcapro-infraestrutura-dados-pessoais.json.gz"' });
    await pipeline(stream,createGzip(),response);
  }
  @Delete('me/data') deletePersonal(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.deletePersonal(user,body); }
  @InfraAdmin() @Get('admin/cycles') adminCycles(@CurrentUser() user: AuthenticatedUser) { return this.service.cycles(user,true); }
  @InfraAdmin() @Post('admin/cycles') createCycle(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.createCycle(user,body); }
  @InfraAdmin() @Post('admin/cycles/:id/chunks') cycleChunk(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.cycleChunk(user,id,body); }
  @InfraAdmin() @Post('admin/cycles/:id/finalize') finalize(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string) { return this.service.finalizeCycle(user,id); }
  @InfraAdmin() @Post('admin/cycles/:id/publish') publish(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string) { return this.service.cycleState(user,id,'publish'); }
  @InfraAdmin() @Post('admin/cycles/:id/archive') cycleArchive(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string) { return this.service.cycleState(user,id,'archive'); }
  @InfraAdmin() @Delete('admin/cycles/:id') cycleDelete(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string) { return this.service.cycleState(user,id,'delete'); }
  @InfraAdmin() @Get('admin/audit') audit(@Query() query: InfraObject) { return this.service.logs(query); }
  @InfraAdmin() @Get('admin/stats') stats() { return this.service.stats(); }
  @InfraAdmin() @Get('admin/projects/:id') adminRead(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string) { return this.service.adminReadProject(user,id); }
  @InfraAdmin() @Get('admin/users') users() { return this.service.users(); }
  @InfraAdmin() @Get('admin/accounts') accounts(@Query() query: InfraObject) { return this.service.accounts(query); }
  @InfraAdmin() @Post('admin/users') createUser(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.createUser(user,body); }
  @InfraAdmin() @Post('admin/users/grant') grant(@CurrentUser() user: AuthenticatedUser,@Body() body: InfraObject) { return this.service.grantUser(user,body); }
  @InfraAdmin() @Patch('admin/users/:id') change(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.grantUser(user,{ ...body,userId: id }); }
  @InfraAdmin() @Delete('admin/users/:id') deleteUser(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.deleteUser(user,id,body); }
  @InfraAdmin() @Post('admin/users/:id/password') password(@CurrentUser() user: AuthenticatedUser,@Param('id') id: string,@Body() body: InfraObject) { return this.service.password(user,id,body); }
  @InfraAdmin() @Put('admin/policies/:name') policy(@CurrentUser() user: AuthenticatedUser,@Param('name') name: string,@Body() body: InfraObject) { return this.service.savePolicy(user,name,body); }
}

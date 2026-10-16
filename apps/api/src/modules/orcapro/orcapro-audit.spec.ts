import { ForbiddenException, NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom, of, throwError } from 'rxjs';
import { OrcaproService } from './orcapro.service';
import { OrcaproAuditInterceptor } from './orcapro-audit.interceptor';
import { auditDetails, auditPeriod } from './orcapro-audit';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcaproAccess } from './orcapro.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const user = { userId: 'actor', tenantId: 'tenant' } as AuthenticatedUser;
describe('OrçaPro audit dates and privacy', () => {
  it('includes the entire final Brazilian calendar day with an exclusive next midnight', () => {
    expect(auditPeriod('2026-10-15', '2026-10-16')).toEqual({ gte: new Date('2026-10-15T03:00:00Z'), lt: new Date('2026-10-17T03:00:00Z') });
    expect(auditPeriod()).toEqual({});
  });
  it.each([['2026-02-30', undefined], ['2026-10-17', '2026-10-16'], ['invalid', undefined]])('rejects invalid/reversed dates %s %s', (from, to) => expect(() => auditPeriod(from, to)).toThrow());
  it('redacts nested secrets and project data, bounds large details', () => {
    expect(auditDetails({ version: 3, password: 'secret', details: { newPassword: 'hidden', authorization: 'hidden', data: { private: true }, uf: 'SP' } })).toEqual({ version: 3, details: { uf: 'SP' } });
    expect((auditDetails({ reason: 'a'.repeat(5000) }) as { reason: string }).reason).toHaveLength(1000);
  });
});
describe('OrçaPro audit administration and tenant boundary', () => {
  function setup(admin = true) {
    const db = {
      orcaproAudit: { count: jest.fn().mockResolvedValue(101), findMany: jest.fn().mockResolvedValue([{ actorUserId: 'actor-other-page', entityId: 'project', metadata: { version: 7 } }]), create: jest.fn().mockResolvedValue({}) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'actor-other-page', name: 'Old account', email: 'old@example.com' }]) },
      orcaproProject: { findMany: jest.fn().mockResolvedValue([{ id: 'project', name: 'Bridge' }]), findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { ...db, $transaction: jest.fn((run: (value: typeof db) => unknown) => run(db)) };
    const access = { assertAdmin: jest.fn(() => { if (!admin) throw new ForbiddenException(); }) };
    return { db, prisma, service: new OrcaproService(prisma as unknown as PrismaService, access as unknown as OrcaproAccess) };
  }
  it('paginates older records, filters dates and actors, resolves identity independently of user list', async () => {
    const { service, db } = setup();
    const response = await service.adminLogs(user, { page: 3, pageSize: 50, category: 'activity', user: 'Old', from: '2026-10-01', to: '2026-10-15' });
    expect(response).toMatchObject({ total: 101, pages: 3, page: 3, items: [{ actor: { name: 'Old account' }, entityName: 'Bridge' }] });
    expect(db.orcaproAudit.findMany.mock.calls[0][0]).toMatchObject({ skip: 100, take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { actorUserId: { in: ['actor-other-page'] }, createdAt: auditPeriod('2026-10-01', '2026-10-15'), NOT: { action: { startsWith: 'access.' } } } });
    expect(db.orcaproAudit.count.mock.calls[0][0].where).toEqual(db.orcaproAudit.findMany.mock.calls[0][0].where);
  });
  it('rejects common users before any cross-tenant audit or identity query', async () => {
    const { service, prisma, db } = setup(false);
    await expect(service.adminLogs(user, { page: 1, pageSize: 50, category: 'all' })).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled(); expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it('cannot attach a navigation event to another tenant/user project', async () => {
    const { service, db } = setup();
    await expect(service.auditNavigation(user, { screen: 'budget', projectId: 'someone-else' })).rejects.toThrow(NotFoundException);
    expect(db.orcaproProject.findFirst).toHaveBeenCalledWith({ where: { id: 'someone-else', tenantId: 'tenant', ownerUserId: 'actor', archivedAt: null }, select: { id: true } });
    expect(db.orcaproAudit.create).not.toHaveBeenCalled();
  });
});
describe('OrçaPro access recording', () => {
  function setup(path: string, actor: AuthenticatedUser | undefined = user) {
    const create = jest.fn().mockResolvedValue({});
    const interceptor = new OrcaproAuditInterceptor({ orcaproAudit: { create } } as unknown as PrismaService, new ConfigService({ ORCAPRO_ENABLED: 'true' }));
    const request = { path, user: actor, method: 'POST', params: { id: 'project' }, body: { password: 'NEVER STORE' }, query: { token: 'NEVER STORE' }, route: { path: '/orcapro/projects/:id' }, ip: '127.0.0.1', get: () => 'Test browser' };
    const context = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ statusCode: 200 }) }) } as unknown as ExecutionContext;
    return { interceptor, context, create };
  }
  it('records method/route/result without request body, search, credentials or response documents', async () => {
    const { interceptor, context, create } = setup('/api/v1/orcapro/projects/project');
    await lastValueFrom(interceptor.intercept(context, { handle: () => of({ private: 'document' }) }));
    expect(create.mock.calls[0][0].data).toMatchObject({ tenantId: 'tenant', actorUserId: 'actor', action: 'access.request', metadata: { method: 'POST', status: 200 } });
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/NEVER STORE|document/);
  });
  it('records unsuccessful authentication without attributing it to a guessed identity', async () => {
    const { interceptor, context, create } = setup('/api/v1/auth/orcapro/login', undefined);
    // Clear the default actor explicitly for a public login request.
    context.switchToHttp().getRequest().user = undefined;
    await expect(lastValueFrom(interceptor.intercept(context, { handle: () => throwError(() => new UnauthorizedException()) }))).rejects.toThrow(UnauthorizedException);
    expect(create.mock.calls[0][0].data).toMatchObject({ actorUserId: '00000000-0000-0000-0000-000000000000', action: 'access.login.failed', metadata: { status: 401 } });
  });
  it('does not generate feedback events while reading audit pages', async () => {
    const { interceptor, context, create } = setup('/api/v1/orcapro/admin/logs');
    await lastValueFrom(interceptor.intercept(context, { handle: () => of({ items: [] }) }));
    expect(create).not.toHaveBeenCalled();
  });
  it('audit storage failures do not turn a successful business mutation into a retry', async () => {
    const { interceptor, context, create } = setup('/api/v1/orcapro/projects/project'); create.mockRejectedValue(new Error('db unavailable'));
    await expect(lastValueFrom(interceptor.intercept(context, { handle: () => of({ saved: true }) }))).resolves.toEqual({ saved: true });
  });
});

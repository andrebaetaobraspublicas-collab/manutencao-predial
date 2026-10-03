import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InfraDatabase } from './infra-db';
import { InfraAccess, InfraGuard } from './infra.guard';
import { InfraController } from './infra.controller';

const actor = { userId: 'user-a', tenantId: 'tenant-a', membershipId: 'membership-a', tenantSlug: 'org-a', name: 'A', email: 'a@example.invalid', role: 'OWNER' } as AuthenticatedUser;
function execution(request: object, handler: Function = InfraController.prototype.session): ExecutionContext {
  return { getHandler: () => handler, getClass: () => InfraController, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}
function request(method = 'GET') {
  const headers: Record<string, string> = { origin: 'https://www.gestaodepredios.com.br' };
  return { user: actor, method, secure: true, headers, cookies: { gp_access: 'signed-central-session-a' }, get: (key: string) => headers[key.toLowerCase()] } as unknown as Request;
}

describe('Infraestrutura guard — matriz administrativa e CSRF', () => {
  let config: ConfigService;
  let access: InfraAccess;
  let guard: InfraGuard;
  let query: jest.Mock;
  beforeEach(() => {
    config = new ConfigService({ INFRA_ENABLED: 'true', CORS_ORIGINS: 'https://www.gestaodepredios.com.br', COOKIE_SECURE: 'true', JWT_ACCESS_SECRET: 'synthetic-test-secret-never-used-in-hostinger' });
    query = jest.fn().mockResolvedValue([{ id: 'local-a', role: 'USER', status: 'ACTIVE', deleted_at: null }]);
    const db = { enabled: () => true, query } as unknown as InfraDatabase;
    access = new InfraAccess(db, config);
    guard = new InfraGuard(access, new Reflector(), config);
  });

  test('todo endpoint admin nega OWNER/USER local com HTTP403', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InfraController)).toContain(InfraGuard);
    const routes = Object.getOwnPropertyNames(InfraController.prototype).filter(name => name !== 'constructor').map(name => ({ name, fn: (InfraController.prototype as unknown as Record<string, Function>)[name]! })).filter(({ fn }) => String(Reflect.getMetadata(PATH_METADATA, fn) || '').startsWith('admin/'));
    expect(routes.length).toBeGreaterThanOrEqual(10);
    for (const route of routes) {
      await expect(guard.canActivate(execution(request(), route.fn))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  test('ausência de identidade autenticada é401 antes de consultar banco', async () => {
    await expect(guard.canActivate(execution({ ...request(), user: undefined }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).not.toHaveBeenCalled();
  });

  test('perfil bloqueado ou encerrado nega acesso inclusive no bootstrap', async () => {
    query.mockResolvedValue([{ id: 'local-a', role: 'ADMIN', status: 'BLOCKED', deleted_at: null }]);
    await expect(guard.canActivate(execution(request()))).rejects.toBeInstanceOf(ForbiddenException);
    query.mockResolvedValue([{ id: 'local-a', role: 'ADMIN', status: 'ACTIVE', deleted_at: new Date() }]);
    await expect(guard.canActivate(execution(request()))).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('token CSRF é ligado ao cookie da sessão central; token de outra sessão falha', () => {
    const first = request('PUT');
    const response = { cookie: jest.fn(), setHeader: jest.fn() } as unknown as Response;
    const token = access.csrf(first, response);
    first.cookies.infra_csrf = token;
    first.headers['x-infra-csrf'] = token;
    expect(() => access.assertMutation(first)).not.toThrow();
    const second = request('PUT');
    second.cookies.gp_access = 'signed-central-session-b';
    second.cookies.infra_csrf = token;
    second.headers['x-infra-csrf'] = token;
    expect(() => access.assertMutation(second)).toThrow(ForbiddenException);
    expect(response.cookie).toHaveBeenCalledWith('infra_csrf', token, expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/infraestrutura' }));
  });

  test('origem estranha e HTTP falham; todas mutações exigem token', async () => {
    const handler = InfraController.prototype.projects;
    const wrongOrigin = request('PUT'); wrongOrigin.headers.origin = 'https://attacker.example';
    expect(() => access.assertMutation(wrongOrigin)).toThrow(ForbiddenException);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await expect(guard.canActivate(execution(request(method), handler))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(execution({ ...request(), secure: false }, handler))).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('query do perfil contém IDs de usuário e tenant da sessão, não do corpo', async () => {
    await guard.canActivate(execution({ ...request(), body: { userId: 'attacker-user', tenantId: 'attacker-tenant', role: 'ADMIN' } }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('external_user_id=? AND tenant_id=?'), ['user-a', 'tenant-a']);
  });
});

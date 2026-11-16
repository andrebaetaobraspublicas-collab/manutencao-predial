import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('SaaS bulletin authentication without maintenance license', () => {
  beforeEach(() => jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());
  const context = (path: string): any => ({getHandler: () => () => {},getClass: () => class {},switchToHttp: () => ({getRequest: () => ({user: {maintenanceAccess: false},originalUrl: path})})});
  const guard = () => new JwtAuthGuard({getAllAndOverride: () => false} as unknown as Reflector);
  it.each(['/api/v1/system-bulletins','/api/v1/system-bulletins?page=1','/api/v1/system-bulletins/capabilities','/api/v1/system-bulletins/id/confirm'])('allows authentication for %s while leaving administrator authorization to BulletinGuard', async path => {
    await expect(guard().canActivate(context(path))).resolves.toBe(true);
  });
  it.each(['/api/v1/buildings','/api/v1/system-bulletins-other','/api/v1/system-bulletins-admin/capabilities'])('keeps maintenance-only and lookalike routes blocked: %s', async path => {
    await expect(guard().canActivate(context(path))).rejects.toThrow('Esta conta não possui acesso à manutenção predial.');
  });
});

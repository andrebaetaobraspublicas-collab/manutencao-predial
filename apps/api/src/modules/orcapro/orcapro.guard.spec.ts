import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { OrcaproAccess, OrcaproGuard } from './orcapro.guard';

const user = { userId: 'person-a',tenantId: 'tenant-a',role: 'OWNER' } as AuthenticatedUser;
const ctx = (method = 'GET',origin?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user,method,headers: { origin } }) }),getHandler: () => () => null,getClass: () => class {} }) as unknown as ExecutionContext;
describe('OrçaPro product RBAC and CSRF isolation',() => {
  let config: ConfigService, prisma: { orcaproUserAccess: { findUnique: jest.Mock } }, access: OrcaproAccess, reflector: { getAllAndOverride: jest.Mock }, guard: OrcaproGuard;
  beforeEach(() => {
    config = new ConfigService({ ORCAPRO_ENABLED: 'true',ORCAPRO_ADMIN_USER_IDS: 'person-global-admin',CORS_ORIGINS: 'https://www.gestaodepredios.com.br,http://localhost:3000' });
    prisma = { orcaproUserAccess: { findUnique: jest.fn().mockResolvedValue(null) } };
    access = new OrcaproAccess(config,prisma as unknown as PrismaService);
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) }; guard = new OrcaproGuard(access,reflector as unknown as Reflector,config);
  });
  it('does not promote a maintenance OWNER to global SINAPI ADMIN',async () => {
    expect(access.role(user)).toBe('USER'); reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(ctx())).rejects.toThrow('Administração global');
  });
  it('requires explicit admin identity and exact global feature activation',async () => {
    config.set('ORCAPRO_ADMIN_USER_IDS',user.userId); reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    config.set('ORCAPRO_ENABLED','1'); await expect(guard.canActivate(ctx())).rejects.toThrow('não habilitado');
  });
  it('rejects absent, null and untrusted origins on cookie-authenticated writes',async () => {
    for (const origin of [undefined,'null','https://evil.example','https://www.gestaodepredios.com.br.evil.example']) await expect(guard.canActivate(ctx('POST',origin))).rejects.toThrow('Origem');
    await expect(guard.canActivate(ctx('PUT','https://www.gestaodepredios.com.br'))).resolves.toBe(true);
  });
  it('blocks only the OrçaPro product when a global app-specific access record is disabled',async () => {
    prisma.orcaproUserAccess.findUnique.mockResolvedValue({ enabled: false });
    await expect(guard.canActivate(ctx())).rejects.toThrow('OrçaPro desativado');
    expect(prisma.orcaproUserAccess.findUnique).toHaveBeenCalledWith({ where: { userId: user.userId } });
  });
  it('limits OrçaPro requests without touching the maintenance authentication guards',async () => {
    config.set('ORCAPRO_REQUESTS_PER_MINUTE','2');
    await guard.canActivate(ctx()); await guard.canActivate(ctx());
    await expect(guard.canActivate(ctx())).rejects.toMatchObject({ status: 429 });
  });
});

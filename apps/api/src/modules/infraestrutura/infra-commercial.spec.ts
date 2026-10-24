import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { validateEnvironment } from '../../config/env.validation';
import { InfraAccess } from './infra.guard';
import type { InfraDatabase } from './infra-db';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { OrcaproAccess } from '../orcapro/orcapro.guard';
import { OrcaproGuard } from '../orcapro/orcapro.guard';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';

describe('Infraestrutura commercial isolation', () => {
  const user = { userId: 'infra-user', tenantId: 'infra-tenant' } as AuthenticatedUser;
  it('requires both new databases and the new web origin; rejects either existing production database', () => {
    const valid = { INFRA_COMMERCIAL: 'true', INFRA_ENABLED: 'true', ORCAPRO_ENABLED: 'true', JWT_ACCESS_SECRET: 'synthetic-only-secret-at-least-32-chars',
      DATABASE_URL: 'mysql://fixture:fixture@localhost/u528277311_orcaproinfra_auth',
      INFRA_DATABASE_URL: 'mysql://fixture:fixture@localhost/u528277311_orcaproinfra_live',
      WEB_BASE_URL: 'https://sistema.orcaobras.com.br', CORS_ORIGINS: 'https://sistema.orcaobras.com.br' };
    expect(validateEnvironment(valid)).toBeDefined();
    for (const key of ['DATABASE_URL', 'INFRA_DATABASE_URL']) {
      for (const database of ['u528277311_orcapro_live', 'u296746636_orcapro_infra']) expect(() => validateEnvironment({ ...valid, [key]: `mysql://fixture:fixture@localhost/${database}` })).toThrow('bancos novos');
    }
    expect(() => validateEnvironment({ ...valid, WEB_BASE_URL: 'https://sistema.orcaproobras.com.br' })).toThrow('domínio');
  });
  it('requires a current paid or manual licence in the same tenant, keeping manual sales possible', async () => {
    const grant = { enabled: true, deletedAt: null };
    let subscription: { tenantId: string; status: string; currentPeriodEnd: Date | null } = { tenantId: user.tenantId, status: 'UNPAID', currentPeriodEnd: null };
    const identity = { orcaproUserAccess: { findUnique: jest.fn(async () => grant) }, orcaproSubscription: { findUnique: jest.fn(async () => subscription) } };
    const access = new InfraAccess({} as InfraDatabase, new ConfigService({ INFRA_COMMERCIAL: 'true' }), identity as unknown as PrismaService);
    expect(await access.subscriptionEnabled(user)).toBe(false);
    subscription = { ...subscription, status: 'MANUAL_CONTRACT' };
    expect(await access.subscriptionEnabled(user)).toBe(true);
    subscription = { ...subscription, tenantId: 'another-tenant' };
    expect(await access.subscriptionEnabled(user)).toBe(false);
    subscription = { ...subscription, tenantId: user.tenantId, status: 'ACTIVE', currentPeriodEnd: new Date(0) };
    expect(await access.subscriptionEnabled(user)).toBe(false);
    grant.enabled = false;
    subscription = { ...subscription, currentPeriodEnd: new Date(Date.now() + 86400000) };
    expect(await access.subscriptionEnabled(user)).toBe(false);
  });
  it('allows the shared billing API but refuses the SINAPI/project API in the Infraestrutura deployment', async () => {
    const access = { enabled: () => true, enabledFor: jest.fn(async () => true), assertAdmin: jest.fn() } as unknown as OrcaproAccess;
    const guard = new OrcaproGuard(access, new Reflector(), new ConfigService({ INFRA_COMMERCIAL: 'true' }));
    const context = (url: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user, method: 'GET', originalUrl: url }) }), getHandler: () => function fixture() {}, getClass: () => class Fixture {} }) as unknown as ExecutionContext;
    await expect(guard.canActivate(context('/api/v1/orcapro/billing'))).resolves.toBe(true);
    await expect(guard.canActivate(context('/api/v1/orcapro/projects'))).rejects.toThrow('exclusivo');
    await expect(guard.canActivate(context('/api/v1/orcapro/catalog'))).rejects.toThrow('exclusivo');
  });
});

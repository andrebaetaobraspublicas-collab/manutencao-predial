import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mariadb from 'mariadb';
import { ContractDatabase, developmentHost } from './contract-db';
import { ContractGuard } from './contract.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

jest.mock('mariadb', () => ({ __esModule: true, default: { createPool: jest.fn() } }));
const poolFactory = mariadb.createPool as jest.Mock;
const config = (overrides: Record<string,string> = {}) => {
  const values: Record<string,string> = { GESTAO_ENABLED: 'true', WEB_BASE_URL: 'https://gestaodepredios.com.br',
    DATABASE_URL: 'mysql://main:secret@db/main', INFRA_DATABASE_URL: 'mysql://infra:secret@db/infra',
    GESTAO_DATABASE_URL: 'mysql://gc:secret@db/management', GESTAO_ADMIN_EMAIL:'admin@example.invalid',GESTAO_ADMIN_USER_IDS: 'admin-id',
    CORS_ORIGINS: 'https://gestaodepredios.com.br,https://www.gestaodepredios.com.br', ...overrides };
  return { get: (key: string) => values[key] } as ConfigService;
};
const admin = { userId:'admin-id',tenantId:'tenant-id',email:'admin@example.invalid' } as AuthenticatedUser;
const context = (user: AuthenticatedUser | undefined, method='GET', origin?: string) => ({ switchToHttp: () => ({ getRequest: () => ({user,method,headers:{origin}}) }) }) as ExecutionContext;

describe('private bootstrap administrator configuration', () => {
 it('does not grant bootstrap access without the configured email', () => {
  const cfg = new ConfigService({GESTAO_ADMIN_USER_IDS:'admin-id'});
  const guard = new ContractGuard({enabled:()=>true} as any,cfg);
  expect(guard.admin(admin)).toBe(false);
 });
});

describe('Gestão Contratual development and identity boundary', () => {
  beforeEach(() => poolFactory.mockReset());
  it.each(['https://sistema.orcaproobras.com.br','https://orcaproinfra.com.br','https://gestaodepredios.com.br.evil.test','not a URL'])('fails closed outside development: %s', async url => {
    expect(developmentHost(url)).toBe(false);
    const db = new ContractDatabase(config({WEB_BASE_URL:url}));
    await expect(db.query('SELECT 1')).rejects.toBeInstanceOf(NotFoundException);
    expect(poolFactory).not.toHaveBeenCalled();
  });
  it('requires an explicit enabled flag, a configured dedicated database and different schema', async () => {
    await expect(new ContractDatabase(config({GESTAO_ENABLED:'false'})).query('SELECT 1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(new ContractDatabase(config({GESTAO_DATABASE_URL:''})).query('SELECT 1')).rejects.toThrow(/não configurado/);
    await expect(new ContractDatabase(config({GESTAO_DATABASE_URL:'mysql://other:secret@db/main'})).query('SELECT 1')).rejects.toThrow(/banco exclusivo/);
    await expect(new ContractDatabase(config({GESTAO_DATABASE_URL:'mysql://other:secret@db/infra'})).query('SELECT 1')).rejects.toThrow(/banco exclusivo/);
    expect(poolFactory).not.toHaveBeenCalled();
  });
  it('uses a small exact-decimal pool and hides connection details on failure', async () => {
    poolFactory.mockReturnValue({ query: jest.fn().mockRejectedValue(new Error('secret password connection host')) });
    await expect(new ContractDatabase(config()).query('SELECT 1')).rejects.toThrow('Banco de Gestão Contratual indisponível; nenhuma alteração foi confirmada.');
    expect(poolFactory).toHaveBeenCalledWith(expect.objectContaining({database:'management',connectionLimit:2,decimalAsNumber:false,bigIntAsNumber:false}));
  });
  it('requires both verified identity ID and email, plus tenant from session', () => {
    const cfg=config(), guard = new ContractGuard(new ContractDatabase(cfg),cfg);
    expect(guard.canActivate(context(admin))).toBe(true);
    expect(() => guard.canActivate(context(undefined))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context({...admin,tenantId:''}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context({...admin,userId:'other-id'}))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({...admin,email:'other@example.com'}))).toThrow(ForbiddenException);
  });
  it('rejects mutations with absent or untrusted Origin, while allowing read-only access', () => {
    const cfg=config(), guard = new ContractGuard(new ContractDatabase(cfg),cfg);
    expect(guard.canActivate(context(admin,'GET'))).toBe(true);
    expect(guard.canActivate(context(admin,'POST','https://gestaodepredios.com.br'))).toBe(true);
    expect(() => guard.canActivate(context(admin,'POST'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(admin,'POST','https://attacker.test'))).toThrow(ForbiddenException);
  });
});

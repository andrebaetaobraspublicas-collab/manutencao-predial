import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { OrcaproPublicGuard } from './orcapro-public.guard';

const ctx = (method = 'POST', origin?: string, ip = '192.0.2.1') => ({ switchToHttp: () => ({ getRequest: () => ({ method, ip, headers: { origin } }) }) }) as ExecutionContext;
describe('Public OrçaPro account protection', () => {
  let config: ConfigService; let guard: OrcaproPublicGuard;
  beforeEach(() => { config = new ConfigService({ ORCAPRO_ENABLED: 'true', CORS_ORIGINS: 'https://sistema.orcaproobras.com.br,http://localhost:3000' }); guard = new OrcaproPublicGuard(config); });
  it('permits public read but rejects untrusted or absent origins for account creation/login', () => {
    expect(guard.canActivate(ctx('GET'))).toBe(true);
    for (const origin of [undefined, 'null', 'https://evil.example', 'https://sistema.orcaproobras.com.br.evil.example']) expect(() => guard.canActivate(ctx('POST', origin))).toThrow('Origem');
    expect(guard.canActivate(ctx('POST', 'https://sistema.orcaproobras.com.br'))).toBe(true);
  });
  it('bounds attempts per IP while keeping another IP available', () => {
    for (let i = 0; i < 10; i++) expect(guard.canActivate(ctx('POST', 'http://localhost:3000'))).toBe(true);
    expect(() => guard.canActivate(ctx('POST', 'http://localhost:3000'))).toThrow('Muitas tentativas');
    expect(guard.canActivate(ctx('POST', 'http://localhost:3000', '192.0.2.2'))).toBe(true);
  });
  it('respects the OrçaPro feature switch', () => { config.set('ORCAPRO_ENABLED', 'false'); expect(() => guard.canActivate(ctx('GET'))).toThrow('não habilitado'); });
});

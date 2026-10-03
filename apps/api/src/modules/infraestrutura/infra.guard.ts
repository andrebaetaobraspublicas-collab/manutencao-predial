import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InfraDatabase } from './infra-db';

const ADMIN = 'infra-global-admin';
const OPTIONAL = 'infra-profile-optional';
export const InfraAdmin = () => SetMetadata(ADMIN, true);
export const InfraProfileOptional = () => SetMetadata(OPTIONAL, true);
export type InfraPrincipal = { id: string; role: 'ADMIN'|'USER'; status: 'ACTIVE'|'PENDING'|'BLOCKED'; deleted_at: Date|null };

@Injectable()
export class InfraAccess {
  constructor(private readonly db: InfraDatabase, private readonly config: ConfigService) {}
  configuredAdmin(userId: string): boolean {
    return (this.config.get<string>('INFRA_ADMIN_USER_IDS') ?? '').split(',').map(id => id.trim()).filter(Boolean).includes(userId);
  }
  async principal(user: AuthenticatedUser): Promise<InfraPrincipal | null> {
    if (!this.db.enabled()) throw new ServiceUnavailableException('OrçaPro Infraestrutura não habilitado.');
    if (this.configuredAdmin(user.userId)) {
      await this.db.query('INSERT INTO InfraUser(id,external_user_id,tenant_id,name,email,role,status) VALUES(?,?,?,?,?,\'ADMIN\',\'ACTIVE\') ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email)',
        [randomUUID(),user.userId,user.tenantId,user.name,user.email]);
    }
    const rows = await this.db.query<InfraPrincipal[]>('SELECT id,role,status,deleted_at FROM InfraUser WHERE external_user_id=? AND tenant_id=? LIMIT 1',[user.userId,user.tenantId]);
    return rows[0] ?? null;
  }
  private signature(nonce: string, request: Request): string {
    const session = request.cookies?.gp_access;
    if (typeof session !== 'string' || !session) throw new UnauthorizedException('Sessão autenticada por cookie obrigatória.');
    const secret = this.config.get<string>('INFRA_CSRF_SECRET') || this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return createHmac('sha256',secret).update(`infraestrutura:csrf:v1:${session}:${nonce}`).digest('base64url');
  }
  validCsrf(token: unknown, request: Request): boolean {
    if (typeof token !== 'string' || !/^[\w-]{43}\.[\w-]{43}$/.test(token)) return false;
    const [nonce,signature] = token.split('.');
    try { const wanted = Buffer.from(this.signature(nonce,request)); const supplied = Buffer.from(signature); return supplied.length === wanted.length && timingSafeEqual(supplied,wanted); }
    catch { return false; }
  }
  csrf(request: Request, response: Response): string {
    const previous = request.cookies?.infra_csrf;
    const token = this.validCsrf(previous,request) ? String(previous) : (() => { const nonce = randomBytes(32).toString('base64url'); return `${nonce}.${this.signature(nonce,request)}`; })();
    response.cookie('infra_csrf',token,{ httpOnly: true, secure: this.config.get<string>('COOKIE_SECURE') === 'true', sameSite: 'lax', path: '/api/v1/infraestrutura', maxAge: 2 * 60 * 60 * 1000 });
    response.setHeader('Cache-Control','no-store');
    return token;
  }
  assertMutation(request: Request): void {
    const origins = (this.config.get<string>('CORS_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean);
    if (!request.headers.origin || request.headers.origin === 'null' || !origins.includes(request.headers.origin)) throw new ForbiddenException('Origem da operação não autorizada.');
    const token = request.get('X-Infra-CSRF');
    if (!token || token !== request.cookies?.infra_csrf || !this.validCsrf(token,request)) throw new ForbiddenException('Proteção CSRF: recarregue o programa e tente novamente.');
  }
}
@Injectable()
export class InfraGuard implements CanActivate {
  private readonly buckets = new Map<string,{ started: number; requests: number }>();
  constructor(private readonly access: InfraAccess, private readonly reflector: Reflector, private readonly config: ConfigService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser; infraPrincipal?: InfraPrincipal }>();
    const user = request.user;
    if (!user?.userId || !user.tenantId) throw new UnauthorizedException();
    const key = `${user.tenantId}:${user.userId}`, now = Date.now();
    if (this.buckets.size > 10000) for (const [id,bucket] of this.buckets) if (now - bucket.started >= 60000) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.started >= 60000) { bucket = { started: now,requests: 0 }; this.buckets.set(key,bucket); }
    if (++bucket.requests > 600) throw new HttpException('Limite de solicitações Infraestrutura excedido. Aguarde um minuto.',HttpStatus.TOO_MANY_REQUESTS);
    if (this.config.get<string>('COOKIE_SECURE') === 'true' && !request.secure) throw new ForbiddenException('HTTPS obrigatório.');
    const profile = await this.access.principal(user);
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL,[context.getHandler(),context.getClass()]);
    if (profile?.deleted_at || profile?.status === 'BLOCKED' || (!optional && profile?.status !== 'ACTIVE')) throw new ForbiddenException('Acesso ao OrçaPro Infraestrutura pendente, bloqueado ou encerrado.');
    const admin = this.access.configuredAdmin(user.userId) || profile?.role === 'ADMIN';
    if (this.reflector.getAllAndOverride<boolean>(ADMIN,[context.getHandler(),context.getClass()]) && (!admin || profile?.status !== 'ACTIVE')) throw new ForbiddenException('Administração global Infraestrutura restrita.');
    if (!['GET','HEAD','OPTIONS'].includes(request.method.toUpperCase())) this.access.assertMutation(request);
    request.infraPrincipal = profile ?? undefined;
    return true;
  }
}

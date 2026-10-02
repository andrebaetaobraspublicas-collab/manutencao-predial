import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';

const ADMIN_KEY = 'orcapro-global-admin';
export const OrcaproAdmin = () => SetMetadata(ADMIN_KEY, true);

@Injectable()
export class OrcaproAccess {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}
  enabled(): boolean { return this.config.get<string>('ORCAPRO_ENABLED') === 'true'; }
  role(user: AuthenticatedUser): 'ADMIN'|'USER' {
    const ids = (this.config.get<string>('ORCAPRO_ADMIN_USER_IDS') ?? '').split(',').map(x => x.trim()).filter(Boolean);
    return ids.includes(user.userId) ? 'ADMIN' : 'USER';
  }
  assertAdmin(user: AuthenticatedUser): void {
    if (this.role(user) !== 'ADMIN') throw new ForbiddenException('Administração global SINAPI restrita.');
  }
  async enabledFor(user: AuthenticatedUser): Promise<boolean> {
    const grant = await this.prisma.orcaproUserAccess.findUnique({ where: { userId: user.userId } });
    return grant?.enabled !== false;
  }
  session(user: AuthenticatedUser) { return { userId: user.userId, tenantId: user.tenantId, role: this.role(user), enabled: this.enabled() }; }
}

@Injectable()
export class OrcaproGuard implements CanActivate {
  private readonly buckets = new Map<string,{ started: number; count: number }>();
  constructor(private readonly access: OrcaproAccess, private readonly reflector: Reflector, private readonly config: ConfigService) {}
  private rateLimit(key: string,maximum: number): void {
    const now = Date.now();
    if (this.buckets.size > 10000) for (const [id,bucket] of this.buckets) if (now - bucket.started >= 60000) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.started >= 60000) { bucket = { started: now,count: 0 }; this.buckets.set(key,bucket); }
    if (++bucket.count > maximum) throw new HttpException('Limite de solicitações OrçaPro excedido. Aguarde um minuto.',HttpStatus.TOO_MANY_REQUESTS);
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    if (!request.user?.userId || !request.user.tenantId) throw new UnauthorizedException();
    if (!this.access.enabled()) throw new ServiceUnavailableException('OrçaPro ainda não habilitado neste ambiente.');
    if (!(await this.access.enabledFor(request.user))) throw new ForbiddenException('Acesso ao OrçaPro desativado.');
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [context.getHandler(), context.getClass()])) this.access.assertAdmin(request.user);
    if (!['GET','HEAD','OPTIONS'].includes(request.method.toUpperCase())) {
      const origins = (this.config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000').split(',').map(x => x.trim()).filter(Boolean);
      const origin = request.headers.origin;
      if (!origin || !origins.includes(origin) || origin === 'null') throw new ForbiddenException('Origem da operação não autorizada.');
    }
    const configured = Number(this.config.get<string>('ORCAPRO_REQUESTS_PER_MINUTE') ?? 600);
    this.rateLimit(request.user.userId,Number.isInteger(configured) && configured > 0 ? Math.min(configured,5000) : 600);
    if (request.method === 'POST' && request.path?.includes('/admin/imports')) this.rateLimit(`import:${request.user.userId}`,10);
    return true;
  }
}

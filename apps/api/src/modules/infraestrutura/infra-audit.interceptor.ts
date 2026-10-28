import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { defer, lastValueFrom } from 'rxjs';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { InfraDatabase } from './infra-db';
import { InfraAuditService } from './infra-audit.service';

@Injectable()
export class InfraAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: InfraAuditService,private readonly db: InfraDatabase,private readonly primary: PrismaService,private readonly config: ConfigService) {}
  intercept(context: ExecutionContext,next: CallHandler) {
    if (context.getType() !== 'http' || this.config.get<string>('INFRA_ENABLED') !== 'true') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>(), res = context.switchToHttp().getResponse<Response>();
    const path = req.path.replace(/\/+$/,''), commercial = this.config.get<string>('INFRA_COMMERCIAL') === 'true';
    const dedicatedLogin = /\/infraestrutura\/auth\/login$/.test(path), sharedLogin = /\/auth\/(orcapro\/)?login$/.test(path), logout = /\/auth\/logout$/.test(path);
    const product = /\/infraestrutura\//.test(path) && !/\/auth\//.test(path) || commercial && /\/orcapro\/(billing|admin)\//.test(path);
    if (req.method === 'OPTIONS' || /\/(admin\/(audit|logs)|activity\/navigation|health)(?:\/|$)/.test(path) || !dedicatedLogin && !sharedLogin && !logout && (!product || !req.user && !commercial)) return next.handle();
    const started = Date.now();
    return defer(async()=>{
      let result: unknown,failure: unknown,logoutActor: Pick<AuthenticatedUser,'userId'|'tenantId'> | undefined;
      if (logout && typeof req.cookies?.gp_refresh === 'string') {
        try {
          const session = await this.primary.refreshSession.findUnique({ where: { tokenHash: createHash('sha256').update(req.cookies.gp_refresh).digest('hex') },select: { userId: true,revokedAt: true,membership: { select: { tenantId: true } } } });
          if (session && !session.revokedAt) logoutActor = { userId: session.userId,tenantId: session.membership.tenantId };
        } catch { /* The original authentication operation remains authoritative. */ }
      }
      try { result = await lastValueFrom(next.handle()); } catch (cause) { failure = cause; }
      const actor = req.user ?? (result as { user?: AuthenticatedUser } | undefined)?.user ?? logoutActor;
      let belongs = dedicatedLogin || commercial && (product || sharedLogin);
      if (!belongs && actor) {
        try { belongs = (await this.db.query<unknown[]>('SELECT id FROM InfraUser WHERE external_user_id=? AND tenant_id=? LIMIT 1',[actor.userId,actor.tenantId])).length>0; } catch { belongs = false; }
      }
      if (belongs && (!logout || logoutActor)) {
        const status = failure ? failure instanceof HttpException ? failure.getStatus() : 500 : res.statusCode;
        await this.audit.record(actor,dedicatedLogin || sharedLogin ? failure ? 'access.login.failed':'access.login' : logout ? 'access.logout' : failure ? 'access.request.failed':'access.request','access',String(req.params?.id ?? req.params?.code ?? 'infraestrutura'),{ method: req.method,route: String(req.route?.path ?? '').slice(0,200),status,durationMs: Date.now()-started,ip: req.ip?.slice(0,64) ?? '',browser: req.get('user-agent')?.slice(0,300) ?? '' });
      }
      if (failure) throw failure;
      return result;
    });
  }
}

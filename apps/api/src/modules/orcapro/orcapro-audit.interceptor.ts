import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { defer, lastValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class OrcaproAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OrcaproAuditInterceptor.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http' || this.config.get<string>('ORCAPRO_ENABLED') !== 'true') return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const path = request.path.replace(/\/+$/, '');
    const login = /\/auth\/(orcapro\/)?login$/.test(path);
    const product = /\/orcapro\//.test(path) && !/\/auth\//.test(path);
    // Audit queries/polling must not change the dataset being paginated.
    if ((!login && (!product || !request.user)) || /\/(?:admin\/logs|activity\/navigation)(?:\/|$)/.test(path) || request.method === 'OPTIONS') return next.handle();
    const started = Date.now();
    return defer(async () => {
      let result: unknown, failure: unknown;
      try { result = await lastValueFrom(next.handle()); } catch (cause) { failure = cause; }
      const actor = request.user ?? (result as { user?: AuthenticatedUser } | undefined)?.user;
      const status = failure ? failure instanceof HttpException ? failure.getStatus() : 500 : response.statusCode;
      try {
        await this.prisma.orcaproAudit.create({ data: {
          actorUserId: actor?.userId ?? '00000000-0000-0000-0000-000000000000', tenantId: actor?.tenantId,
          action: login ? failure ? 'access.login.failed' : 'access.login' : failure ? 'access.request.failed' : 'access.request',
          entityId: String(request.params?.id ?? request.params?.code ?? 'orcapro').slice(0, 100),
          metadata: { method: request.method, route: String(request.route?.path ?? '').slice(0, 200), status, durationMs: Date.now() - started, ip: request.ip?.slice(0, 64) ?? '', browser: request.get('user-agent')?.slice(0, 300) ?? '' },
        } });
      } catch { this.logger.error('Falha ao registrar acesso OrçaPro; nenhuma credencial foi registrada.'); }
      if (failure) throw failure;
      return result;
    });
  }
}

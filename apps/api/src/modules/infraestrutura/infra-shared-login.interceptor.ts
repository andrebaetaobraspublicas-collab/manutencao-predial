import { BadRequestException, HttpException, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { defer, lastValueFrom, type Observable } from 'rxjs';
import { InfraLoginSecurity } from './infra-login-security';

// Shared credentials must not provide an alternative channel around the
// Infraestrutura quota. The dedicated Infra login already consumes these same
// buckets, so it is deliberately excluded to avoid counting one request twice.
const sharedLoginPaths = new Set(['/api/v1/auth/login','/api/v1/auth/orcapro/login','/api/v1/orcapro/auth/login']);

@Injectable()
export class InfraSharedLoginInterceptor implements NestInterceptor {
  constructor(private readonly security: InfraLoginSecurity,private readonly config: ConfigService) {}
  async intercept(context: ExecutionContext,next: CallHandler): Promise<Observable<unknown>> {
    if (this.config.get<string>('INFRA_ENABLED') !== 'true' || context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const path = (request.originalUrl || request.url || '').split('?')[0].replace(/\/+$/,'').toLowerCase();
    if (request.method.toUpperCase() !== 'POST' || !sharedLoginPaths.has(path)) return next.handle();
    // Older clients keep their existing login body/cookies. Their browser Origin
    // is sufficient to reject a login-CSRF request; no new CSRF cookie is added.
    this.security.requireOrigin(request);
    const supplied = request.body?.email;
    const email = typeof supplied === 'string' ? supplied.trim().toLowerCase() : '';
    if (!email || email.length > 254 || Buffer.byteLength(email,'utf8') > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Informe um e-mail válido.');
    const keys = await this.security.consume(email,request.ip || request.socket?.remoteAddress || 'unknown');
    return defer(async () => {
      let result: unknown;
      try { result = await lastValueFrom(next.handle()); }
      catch (error) {
        if (error instanceof HttpException && error.getStatus() === 401) await this.security.finish(keys,false);
        throw error;
      }
      await this.security.finish(keys,true);
      return result;
    });
  }
}

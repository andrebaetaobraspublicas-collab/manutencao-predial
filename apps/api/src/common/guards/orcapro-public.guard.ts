import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** Only protects the public OrçaPro account routes; never changes maintenance login. */
@Injectable()
export class OrcaproPublicGuard implements CanActivate {
  private readonly buckets = new Map<string, { started: number; count: number }>();
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('ORCAPRO_ENABLED') !== 'true') throw new ServiceUnavailableException('OrçaPro ainda não habilitado neste ambiente.');
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'GET') return true;
    const origins = (this.config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000').split(',').map(value => value.trim());
    if (!request.headers.origin || !origins.includes(request.headers.origin)) throw new ForbiddenException('Origem não autorizada para esta operação.');
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (now - bucket.started >= 60000) this.buckets.delete(key);
    const key = request.ip || request.socket?.remoteAddress || 'unknown';
    if (!this.buckets.has(key) && this.buckets.size >= 10000) throw new HttpException('Aguarde um minuto antes de tentar novamente.', HttpStatus.TOO_MANY_REQUESTS);
    const bucket = this.buckets.get(key) ?? { started: now, count: 0 };
    this.buckets.set(key, bucket);
    if (++bucket.count > 10) throw new HttpException('Muitas tentativas. Aguarde um minuto antes de tentar novamente.', HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }
}

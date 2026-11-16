import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { contractEnvironment } from '../contract-management/contract-environment';

@Injectable()
export class GestaoLoginGuard implements CanActivate {
  private readonly attempts = new Map<string, { start: number; count: number }>();
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    if (!contractEnvironment(this.config)) throw new NotFoundException();
    const req = context.switchToHttp().getRequest<Request>();
    if (!String(this.config.get('CORS_ORIGINS') || '').split(',').map(x => x.trim()).includes(req.headers.origin || '')) throw new ForbiddenException('Origem não autorizada.');
    const now = Date.now();
    for (const [key, item] of this.attempts) if (now - item.start >= 60000) this.attempts.delete(key);
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!this.attempts.has(key) && this.attempts.size >= 10000) throw new HttpException('Aguarde um minuto antes de tentar novamente.', 429);
    const item = this.attempts.get(key) || { start: now, count: 0 };
    this.attempts.set(key, item);
    if (++item.count > 10) throw new HttpException('Muitas tentativas. Aguarde um minuto antes de tentar novamente.', 429);
    return true;
  }
}

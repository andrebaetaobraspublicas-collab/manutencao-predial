import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;
    const authenticated = await super.canActivate(context);
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; originalUrl: string }>();
    const path = request.originalUrl.split('?')[0];
    // Bulletins belong to the SaaS administration, not the maintenance product.
    // BulletinGuard still independently enforces the global administrator IDs.
    const bulletinRoute = /^\/api\/v1\/system-bulletins(?:\/|$)/.test(path);
    if (request.user?.maintenanceAccess === false && !path.startsWith('/api/v1/auth/') && !path.startsWith('/api/v1/orcapro/') && !path.startsWith('/api/v1/infraestrutura/') && !bulletinRoute) {
      throw new ForbiddenException('Esta conta não possui acesso à manutenção predial.');
    }
    return authenticated === true;
  }
}

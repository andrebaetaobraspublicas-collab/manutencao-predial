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
    if (request.user?.maintenanceAccess === false && !path.startsWith('/api/v1/auth/') && !path.startsWith('/api/v1/orcapro/') && !path.startsWith('/api/v1/infraestrutura/')) {
      throw new ForbiddenException('Esta conta não possui acesso à manutenção predial.');
    }
    return authenticated === true;
  }
}

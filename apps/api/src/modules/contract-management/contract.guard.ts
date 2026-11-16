import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractDatabase } from './contract-db';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
@Injectable()
export class ContractGuard implements CanActivate {
  private readonly buckets=new Map<string,{start:number;count:number}>();
  constructor(private readonly db: ContractDatabase,private readonly config: ConfigService,@Optional() @Inject('GESTAO_BILLING') private readonly billing?:{allowed(user:AuthenticatedUser):Promise<boolean>;allowedOwn(user:AuthenticatedUser):Promise<boolean>}) {}
  admin(user: AuthenticatedUser) { return user.email.toLowerCase()===String(this.config.get('GESTAO_ADMIN_EMAIL') || '').trim().toLowerCase() && String(this.config.get('GESTAO_ADMIN_USER_IDS')||'').split(',').map(x=>x.trim()).includes(user.userId); }
  canActivate(ctx: ExecutionContext) {
    const req=ctx.switchToHttp().getRequest<{user:AuthenticatedUser;method:string;path?:string;headers:{origin?:string}}>();
    if (!req.user?.tenantId || !req.user.userId) throw new UnauthorizedException();
    if (!this.db.enabled()) throw new NotFoundException();
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !String(this.config.get('CORS_ORIGINS')||'').split(',').map(x=>x.trim()).includes(req.headers.origin||'')) throw new ForbiddenException('Origem não autorizada.');
    const path=req.path?.replace(/^\/api\/v1/,'')||'',heavy=path.includes('/imports/')||path.endsWith('/preview')||(req.method==='POST'&&(path.endsWith('/attachments')||path==='/contract-management/contracts'||path==='/contract-management/contracts/demo')),key=`${req.user.tenantId}:${req.user.userId}:${heavy?'heavy':'all'}`,now=Date.now();
    if(this.buckets.size>10000)for(const [k,b] of this.buckets)if(now-b.start>=60000)this.buckets.delete(k);
    const bucket=this.buckets.get(key);if(!bucket||now-bucket.start>=60000)this.buckets.set(key,{start:now,count:1});else if(++bucket.count>(heavy?12:600))throw new HttpException('Limite de solicitações excedido. Aguarde um minuto.',429);
    if(path==='/contract-management/access'&&req.method==='GET')return true;
    if(this.admin(req.user))return true;
    if(!this.billing)throw new ForbiddenException('Acesso ao módulo não habilitado.');
    const own=(req.method==='POST'&&(path==='/contract-management/contracts'||path==='/contract-management/contracts/demo'||(path.startsWith('/contract-management/imports/')&&!/\/measurement-(map|confirm)$/.test(path))))||path.startsWith('/contract-management/sources/');
    return (own?this.billing.allowedOwn(req.user):this.billing.allowed(req.user)).then(ok=>{if(!ok)throw new ForbiddenException(own?'Assinatura própria de Gestão Contratual necessária para criar contratos.':'Acesso à Gestão Contratual não habilitado.');return true;});
  }
}

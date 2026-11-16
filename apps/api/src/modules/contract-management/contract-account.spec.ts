import { UnauthorizedException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ContractSaasAudit, ContractSaasAuditInterceptor } from './contract-saas-audit';

describe('Self-service account audit',()=>{
 const actor:any={tenantId:'tenant-a',userId:'user-a'};
 it('records own password metadata only for a profile in the authenticated tenant',async()=>{
  const db:any={query:jest.fn().mockResolvedValueOnce([{id:'profile'}]).mockResolvedValueOnce([])};
  const audit=new ContractSaasAudit(db,{} as any,{} as any);
  await audit.passwordChange(actor,false,204);
  expect(db.query).toHaveBeenNthCalledWith(1,expect.stringContaining('tenant_id=? AND user_id=?'),['tenant-a','user-a']);
  const args=db.query.mock.calls[1][1];expect(args.slice(1,5)).toEqual(['tenant-a','user-a','account.password.changed','user-a']);
  expect(JSON.parse(args[5])).toEqual({status:204,sharedIdentity:true,sessionsRevoked:true});
 });
 it('does not log identities that have no profile in this tenant',async()=>{
  const db:any={query:jest.fn().mockResolvedValue([])};await new ContractSaasAudit(db,{} as any,{} as any).passwordChange(actor,false,204);expect(db.query).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('observes the result without reading the password body (failure=%s)',async failed=>{
  const req={path:'/api/v1/auth/password/change',method:'POST',user:actor,get body(){throw Error('Credentials must not be read by audit');}};
  const audit:any={passwordChange:jest.fn()},db:any={enabled:()=>true};
  const ctx:any={getType:()=> 'http',switchToHttp:()=>({getRequest:()=>req,getResponse:()=>({statusCode:204})})};
  const stream=new ContractSaasAuditInterceptor(db,audit).intercept(ctx,{handle:()=>failed?throwError(()=>new UnauthorizedException()):of(undefined)});
  if(failed)await expect(lastValueFrom(stream)).rejects.toBeInstanceOf(UnauthorizedException);else await lastValueFrom(stream);
  expect(audit.passwordChange).toHaveBeenCalledWith(actor,failed,failed?401:204);
 });
 it('does not observe the shared endpoint when Gestao is disabled',async()=>{
  const audit:any={passwordChange:jest.fn()},ctx:any={getType:()=> 'http'},next={handle:jest.fn(()=>of('ok'))};
  expect(await lastValueFrom(new ContractSaasAuditInterceptor({enabled:()=>false} as any,audit).intercept(ctx,next))).toBe('ok');expect(audit.passwordChange).not.toHaveBeenCalled();
 });
});

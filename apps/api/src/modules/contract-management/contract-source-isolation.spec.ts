import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContractService } from './contract.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const owner={userId:'owner',tenantId:'org-a'} as AuthenticatedUser;
const baseline={regime:'UNIT_PRICE',originalValue:'100',paradigmOriginal:'100',examples:[],events:[],items:[{id:'i',code:'1',description:'Item',unit:'UN',originalQuantity:'1',quantity:'1',unitPrice:'100',referencePrice:'100',originalTotal:'100',measured:'0'}]};

describe('Gestão Contratual source and ownership isolation',()=>{
  it('reads a contract only under both owner and tenant, even with a known contract ID',async()=>{
    const row={id:'contract',tenant_id:'org-a',owner_id:'owner',version:1,baseline,regime:'UNIT_PRICE',original_value:'100',demo:true};
    const query=jest.fn(async (sql:string,args:unknown[])=>{
      if(sql.startsWith('SELECT c.')) {
        expect(sql).toContain('c.tenant_id=? AND c.owner_id=?');
        return args[0]==='contract'&&args[1]==='org-a'&&args[2]==='owner'?[row]:[];
      }
      expect(sql).toContain('tenant_id=? AND owner_id=?');
      expect(args).toEqual(['contract','org-a','owner']);
      return [];
    });
    const service=new ContractService({query} as any,{} as any,{} as any,{} as any);
    await expect(service.detail(owner,'contract')).resolves.toMatchObject({contract:{id:'contract'}});
    await expect(service.detail({...owner,tenantId:'org-b'},'contract')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detail({...owner,userId:'other'},'contract')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses unauthorized or changed source before any new database write',async()=>{
    const transaction=jest.fn(),project=jest.fn().mockResolvedValue({id:'source',version:2});
    const enabledFor=jest.fn().mockResolvedValue(false);
    const service=new ContractService({transaction} as any,{project} as any,{enabledFor} as any,{} as any);
    const dto={sourceProjectId:'source',sourceProduct:'ORCAPRO' as const,regime:'UNIT_PRICE' as const,expectedSourceVersion:1};
    await expect(service.demo(owner,dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(project).not.toHaveBeenCalled();
    enabledFor.mockResolvedValue(true);
    await expect(service.demo(owner,dto)).rejects.toBeInstanceOf(ConflictException);
    expect(project).toHaveBeenCalledWith(owner,'source');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses a source that changes between authorized snapshot and calculation',async()=>{
    const transaction=jest.fn(),project=jest.fn().mockResolvedValue({id:'source',version:1,data:{}}),calculation=jest.fn().mockResolvedValue({version:2,summary:{}});
    const service=new ContractService({transaction} as any,{project,calculation} as any,{enabledFor:async()=>true} as any,{} as any);
    await expect(service.demo(owner,{sourceProjectId:'source',sourceProduct:'ORCAPRO',regime:'UNIT_PRICE',expectedSourceVersion:1})).rejects.toBeInstanceOf(ConflictException);
    expect(calculation).toHaveBeenCalledWith(owner,'source');
    expect(transaction).not.toHaveBeenCalled();
  });
});

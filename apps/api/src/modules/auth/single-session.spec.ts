import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('Sessão única no desenvolvimento', () => {
  function setup(options: Record<string,string | undefined> = {}) {
    let version = 0;
    const tokens: any[] = [];
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      tenantMembership: {
        findUniqueOrThrow: jest.fn(async () => ({sessionVersion:version})),
        updateMany: jest.fn(async () => { version++; return {count:1}; }),
      },
      refreshSession: {updateMany:jest.fn().mockResolvedValue({count:1}),create:jest.fn(async (x:any) => tokens.push(x))},
    };
    const prisma: any = {$transaction:async (fn:any) => fn(tx)};
    const config = new ConfigService({AUTH_SINGLE_SESSION:'true',WEB_BASE_URL:'https://www.gestaodepredios.com.br',...options});
    const service = new AuthService(prisma,new JwtService({secret:'test'}),config,{} as any,{} as any);
    const issue = (refresh?:any) => (service as any).issueSession({id:'u',name:'U',email:'u@test'}, {id:'m',tenantId:'t',role:'REQUESTER',sessionVersion:0},{id:'t',slug:'t'},{get:()=> 'same browser',ip:'127.0.0.1'},refresh);
    return {service,issue,tx,tokens};
  }
  it('novo login invalida imediatamente o JWT anterior pela versão, sem usar IP', async () => {
    const {issue} = setup(); const jwt=new JwtService({secret:'test'});
    const a=await issue(), b=await issue();
    expect(jwt.verify(a.accessToken).sessionVersion).toBe(1);
    expect(jwt.verify(b.accessToken).sessionVersion).toBe(2);
  });
  it('refresh antigo não ressuscita sessão encerrada por novo login', async () => {
    const {issue}=setup();const a=await issue();await issue();
    await expect(issue({id:'r',token:a.refreshToken})).rejects.toThrow('novo login');
  });
  it('refresh atual preserva geração e consome refresh apenas uma vez', async () => {
    const {issue,tx}=setup();const a=await issue();
    const b=await issue({id:'r',token:a.refreshToken});expect(b.refreshToken).toMatch(/^v1\./);
    tx.refreshSession.updateMany.mockResolvedValueOnce({count:0});
    await expect(issue({id:'r',token:b.refreshToken})).rejects.toThrow('já utilizada');
  });
  it.each(['ORCAPRO_ADMIN_USER_IDS','INFRA_ADMIN_USER_IDS'])('administrador %s pode manter sessões', async key => {
    const {issue,tx}=setup({[key]:'u'});await issue();await issue();expect(tx.tenantMembership.updateMany).not.toHaveBeenCalled();
  });
  it('perfil ADMIN ativo do Infra também é isento', async () => {
    const {service,issue,tx}=setup({INFRA_ENABLED:'true'});
    (service as any).modules={get:()=>({query:async()=>[{role:'ADMIN'}]})};
    await issue();expect(tx.tenantMembership.updateMany).not.toHaveBeenCalled();
  });
  it.each([{AUTH_SINGLE_SESSION:'false'},{WEB_BASE_URL:'https://unrelated.example'}])('não ativa fora do desenvolvimento autorizado: %j', async options => {
    const {issue,tx}=setup(options);await issue();expect(tx.tenantMembership.updateMany).not.toHaveBeenCalled();
  });
  it('monitor usa consulta somente de leitura e retorna estado inválido sem renovar', async () => {
    const {service,tx}=setup();
    const findFirst=jest.fn().mockResolvedValue(null);
    (service as any).prisma.refreshSession={findFirst};
    expect(await service.sessionStatus('opaque-token')).toEqual({enforced:true,active:false});
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({revokedAt:null,tokenHash:expect.any(String)})}));
    expect(tx.refreshSession.create).not.toHaveBeenCalled();
    findFirst.mockResolvedValue({id:'r'});
    expect(await service.sessionStatus('opaque-token')).toEqual({enforced:true,active:true});
  });
  it('monitor não ativa em domínio não autorizado',async()=>{
    const {service}=setup({WEB_BASE_URL:'https://unrelated.example'});
    expect(await service.sessionStatus('opaque')).toEqual({enforced:false});
  });

  it.each(['https://sistema.orcaproobras.com.br','https://orcaproinfra.com.br'])('produção autorizada %s aplica a mesma regra', async url=>{
    const {issue}=setup({WEB_BASE_URL:url});const a=await issue();await issue();
    await expect(issue({id:'r',token:a.refreshToken})).rejects.toThrow('novo login');
  });

});


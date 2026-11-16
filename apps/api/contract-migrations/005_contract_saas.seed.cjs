// Run only after migration 005, from a process holding the private DEV environment.
// No credentials are printed or stored here. Safe to rerun: existing profiles stay intact.
const {randomUUID}=require('node:crypto');
async function seedGestaoSaas(config,connect){
 const assert=require('node:assert/strict'),host=new URL(config.WEB_BASE_URL).hostname;
 assert.equal(host,'gestaodepredios.com.br');assert.equal(config.GESTAO_ENABLED,'true');
 const gu=new URL(config.GESTAO_DATABASE_URL),pu=new URL(config.DATABASE_URL);
 assert.equal(gu.pathname,'/u296746636_gestao_dev');assert.equal(pu.pathname,'/u296746636_gestaopredios');
 assert.notEqual(gu.pathname,pu.pathname);
 const db=await connect(gu),primary=await connect(pu);let inserted=0;
 try{
  const ids=String(config.GESTAO_ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const roots=await primary.query('SELECT id FROM User WHERE email=? AND deletedAt IS NULL AND status=?',[String(config.GESTAO_ADMIN_EMAIL||'').trim().toLowerCase(),'ACTIVE']);
  const root=roots.find(x=>ids.includes(x.id));assert(root,'Configured administrator missing');
  const owners=await db.query('SELECT tenant_id,user_id FROM GcMember UNION SELECT tenant_id,owner_id user_id FROM GcContract UNION SELECT tenant_id,owner_id user_id FROM GcBillingAccount');
  const rootsMemberships=await primary.query("SELECT tenantId tenant_id,userId user_id FROM TenantMembership WHERE userId=? AND status='ACTIVE'",[root.id]);owners.push(...rootsMemberships);
  await db.beginTransaction();try{
   for(const pair of owners){
    const m=(await primary.query('SELECT m.id,m.status,m.expiresAt,u.status user_status,u.deletedAt,t.status tenant_status,t.deletedAt tenant_deleted FROM TenantMembership m JOIN User u ON u.id=m.userId JOIN Tenant t ON t.id=m.tenantId WHERE m.userId=? AND m.tenantId=?',[pair.user_id,pair.tenant_id]))[0];
    if(!m)continue;
    const valid=m.status==='ACTIVE'&&m.user_status==='ACTIVE'&&!m.deletedAt&&!m.tenant_deleted&&m.tenant_status!=='SUSPENDED'&&(!m.expiresAt||new Date(m.expiresAt)>new Date());
    const r=await db.query("INSERT IGNORE INTO GcSaasUser(id,membership_id,tenant_id,user_id,role,status,billing_source) VALUES(?,?,?,?,?,?,'STRIPE')",[randomUUID(),m.id,pair.tenant_id,pair.user_id,pair.user_id===root.id?'ADMIN':'USER',valid?'ACTIVE':'SUSPENDED']);inserted+=Number(r.affectedRows);
   }
   for(const [name,title,body] of [['privacy','Política de privacidade','Rascunho: cadastre e revise a política específica da Gestão Contratual antes de publicar.'],['terms','Termos de uso','Rascunho: cadastre e revise as condições de uso da Gestão Contratual antes de publicar.'],['notice','Informativo do sistema','Rascunho: informe as novidades da Gestão Contratual antes de publicar este aviso interno.']])await db.query('INSERT IGNORE INTO GcSaasSetting(name,title,body,published,updated_by) VALUES(?,?,?,FALSE,?)',[name,title,body,root.id]);
   await db.commit();
  }catch(e){await db.rollback();throw e;}
  return {profilesInserted:inserted,settings:'unpublished drafts preserved',licences:'legacy Stripe sources preserved'};
 }finally{await db.end();await primary.end();}
}
module.exports={seedGestaoSaas};

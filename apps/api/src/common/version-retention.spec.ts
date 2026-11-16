import { effectiveDocument, annotateHistory, disposableVersions, historyDay, historySession, HistoryRow, versionRetentionEnabled } from './version-retention';
const now=new Date('2026-11-14T18:00:00Z');
const row=(version:number,more:Partial<HistoryRow>={}):HistoryRow=>({version,session_key:'a',work_day:'2026-11-13',created_at:new Date('2026-11-13T12:00:00Z'),superseded_at:new Date('2026-11-13T18:00:00Z'),...more});
describe('development version retention',()=>{
 it('ignores only the UI timestamp and key order, retaining meaningful changes',()=>{
  expect(effectiveDocument({updated:1,root:{qty:2,name:'a'}})).toBe(effectiveDocument({root:{name:'a',qty:2},updated:9}));
  expect(effectiveDocument({root:{qty:2}})).not.toBe(effectiveDocument({root:{qty:3}}));
  expect(effectiveDocument({risks:{updated:1}})).not.toBe(effectiveDocument({risks:{updated:2}}));
 });
 it('keeps the last version per session and day',()=>expect(disposableVersions([row(1),row(2),row(3,{session_key:'b'}),row(4,{work_day:'2026-11-14'})],now)).toEqual([1]));
 it('gives 24 hours after replacement, not creation',()=>expect(disposableVersions([row(1,{superseded_at:new Date(now.getTime()-86399999)}),row(2)],now)).toEqual([]));
 it('never deletes unknown sessions or protected facts',()=>expect(disposableVersions([row(1,{session_key:null}),row(2,{protected:true}),row(3)],now)).toEqual([]));
 it('does not infer old session boundaries',()=>expect(disposableVersions([row(1,{superseded_at:null}),row(2)],now)).toEqual([]));
 it('uses Sao Paulo midnight',()=>{expect(historyDay(new Date('2026-11-14T02:59:59Z'))).toBe('2026-11-13');expect(historyDay(new Date('2026-11-14T03:00:00Z'))).toBe('2026-11-14');});
 it('separates users and tenants',()=>{const a:any={tenantId:'a',userId:'u',workSessionId:'s'};expect(historySession(a)).not.toBe(historySession({...a,tenantId:'b'}));expect(historySession(a)).not.toBe(historySession({...a,userId:'v'}));expect(historySession({...a,workSessionId:undefined})).toBeNull();});
 it('fails closed for commercial hosts or databases',()=>{
  const config=(values:any):any=>({get:(key:string)=>values[key]});
  const good={VERSION_RETENTION_DEV:'true',WEB_BASE_URL:'https://www.gestaodepredios.com.br',DATABASE_URL:'mysql://u:p@localhost/u296746636_gestaopredios'};
  expect(versionRetentionEnabled(config(good))).toBe(true);
  for(const change of [{VERSION_RETENTION_DEV:'false'},{WEB_BASE_URL:'https://sistema.orcaproobras.com.br'},{WEB_BASE_URL:'https://gestaodepredios.com.br.evil.test'},{DATABASE_URL:'mysql://u:p@localhost/u528277311_orcapro_live'}])expect(versionRetentionEnabled(config({...good,...change}))).toBe(false);
 });
 it('exposes recovery without hiding legacy/protected snapshots',()=>expect(annotateHistory([{version:1},{version:2},{version:3},{version:4}],[row(1),row(2,{protected:true}),row(3)]).map(r=>r.retentionState)).toEqual(['RECOVERY','KEPT','KEPT','KEPT']));
});

it('requires independent production opt-in and exact OrçaPro host/database',()=>{
 const config=(v:any):any=>({get:(k:string)=>v[k]});
 const good={VERSION_RETENTION_ORCAPRO_PROD:'true',WEB_BASE_URL:'https://sistema.orcaproobras.com.br',DATABASE_URL:'mysql://u@localhost/u528277311_orcapro_live'};
 expect(versionRetentionEnabled(config(good))).toBe(true);
 for(const change of [{VERSION_RETENTION_ORCAPRO_PROD:'false'},{WEB_BASE_URL:'https://orcaproinfra.com.br'},{WEB_BASE_URL:'https://gestaodepredios.com.br'},{DATABASE_URL:'mysql://u@localhost/u528277311_infra_live'}])expect(versionRetentionEnabled(config({...good,...change}))).toBe(false);
});

it('Infra production requires its own flag and both exact databases',()=>{
 const config=(v:any):any=>({get:(k:string)=>v[k]});
 const good={VERSION_RETENTION_INFRA_PROD:'true',WEB_BASE_URL:'https://orcaproinfra.com.br',DATABASE_URL:'mysql://u@localhost/u528277311_infra_auth',INFRA_DATABASE_URL:'mysql://u@localhost/u528277311_infra_live'};
 expect(versionRetentionEnabled(config(good))).toBe(true);
 for(const change of [{VERSION_RETENTION_INFRA_PROD:'false'},{WEB_BASE_URL:'https://sistema.orcaproobras.com.br'},{DATABASE_URL:'mysql://u@localhost/u528277311_orcapro_live'},{INFRA_DATABASE_URL:'mysql://u@localhost/u296746636_orcapro_infra'}])expect(versionRetentionEnabled(config({...good,...change}))).toBe(false);
});

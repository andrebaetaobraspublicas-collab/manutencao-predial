'use client';
import { FormEvent, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { GESTAO_ONLY } from '@/lib/product-config';
import { SourceLink } from './source-link';
import { apiFetch } from '@/lib/api';
import s from './contract.module.css';

export function ContractAccount({onBusy,onDirty}:{onBusy:(value:boolean)=>void;onDirty:(value:boolean)=>void}) {
  const [account,setAccount]=useState<{name:string;email:string}|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[changed,setChanged]=useState(false);
  useEffect(()=>{let active=true;void apiFetch<{user:{name:string;email:string}}>('/auth/me').then(result=>{if(active)setAccount(result.user);}).catch(()=>{if(active)setError('Não foi possível consultar a conta. Entre novamente para continuar.');});return()=>{active=false;};},[]);
  async function change(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setError('');
    const form=event.currentTarget,data=new FormData(form),currentPassword=String(data.get('currentPassword')||''),newPassword=String(data.get('newPassword')||'');
    if(newPassword!==data.get('confirmation')){setError('A confirmação não corresponde à nova senha.');return;}
    if(newPassword.length<10||new TextEncoder().encode(newPassword).length>72){setError('Use pelo menos 10 caracteres e até 72 bytes; acentos e símbolos podem ocupar mais de um byte.');return;}
    if(data.get('acknowledge')!=='on'){setError('Confirme que deseja encerrar as sessões desta conta.');return;}
    setBusy(true);onBusy(true);
    try {
      await apiFetch('/auth/password/change',{method:'POST',body:JSON.stringify({currentPassword,newPassword})},false);
      form.reset();onDirty(false);setChanged(true);
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível alterar a senha.');}
    finally{setBusy(false);onBusy(false);}
  }
  return <section className={s.panel}><h1>Minha conta</h1><p className={s.caption}>{GESTAO_ONLY ? "Conta exclusiva da Gestão Contratual. Alterar esta senha não modifica o OrçaPro nem o Infra." : "Identidade compartilhada entre os programas OrçaPro."}</p>{error&&<p className={s.error} role="alert">{error}</p>}{changed?<div role="status"><h2>Senha alterada</h2><p>Todas as sessões anteriores foram encerradas. Seus contratos e sua assinatura foram preservados.</p><a className={`${s.button} ${s.primary}`} href="/login?next=/gestao-contratual">Entrar com a nova senha</a></div>:<><p><strong>{account?.name||'Consultando conta…'}</strong><br/>{account?.email}</p><form className={s.form} aria-label="Alterar minha senha" onSubmit={change} onChange={()=>onDirty(true)}><h2 className={s.wide}><KeyRound size={18}/> Alterar senha</h2><label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required disabled={busy}/></label><label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required disabled={busy}/></label><label>Confirmar nova senha<input name="confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={72} required disabled={busy}/></label><p className={`${s.caption} ${s.wide}`}>Use uma senha exclusiva com pelo menos 10 caracteres. {GESTAO_ONLY ? "A alteração exige sua senha atual e encerra as sessões da Gestão Contratual." : "A alteração exige sua senha atual, vale para os programas que usam esta conta e encerra todas as sessões abertas."}</p><label className={`${s.check} ${s.wide}`}><input name="acknowledge" type="checkbox" required disabled={busy}/>{GESTAO_ONLY ? "Entendi que precisarei entrar novamente na Gestão Contratual." : "Entendi que a senha é compartilhada e precisarei entrar novamente em todos os programas."}</label><div className={s.wide}><button className={`${s.button} ${s.primary}`} disabled={busy||!account}>{busy?'Alterando…':'Alterar minha senha'}</button></div></form>{GESTAO_ONLY&&<SourceLink/>}</>}</section>;
}

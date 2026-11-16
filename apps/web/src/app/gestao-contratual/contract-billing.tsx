'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { stripeDestination } from '@/lib/product-config';
import { money } from './sheet-math';
import s from './contract.module.css';

type Configuration = { configured: boolean; testMode: boolean; prerequisite?:{required:boolean;eligible:boolean;message:string}; subscription: { status: string; currentPeriodEnd?: string; cancelAtPeriodEnd?: boolean } | null; manual?:{status:string;currentPeriodEnd?:string}|null;profileStatus?:string;plans?:{id:string;name:string;billingInterval:string;priceBrl:string}[];canCheckout: boolean; canPortal: boolean; adminExempt: boolean; message?: string };
const status: Record<string, string> = { active: 'Ativa', trialing: 'Período de teste', past_due: 'Pagamento pendente', canceled: 'Cancelada', unpaid: 'Não paga', incomplete: 'Cadastro incompleto', incomplete_expired: 'Cadastro expirado', paused: 'Pausada' };

export function ContractBilling() {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [planId,setPlanId]=useState('');
  useEffect(() => { let active = true; void apiFetch<Configuration>('/contract-management/billing/config').then(value => { if (active) {setConfig(value);setPlanId(value.plans?.[0]?.id||'');} }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Assinatura indisponível.'); }); return () => { active = false; }; }, []);
  async function redirect(path: 'checkout' | 'portal') {
    setBusy(true); setError('');
    try {
      const result = await apiFetch<{ url: string }>(`/contract-management/billing/${path}`, { method: 'POST', body: JSON.stringify(path === 'checkout' ? { requestId: crypto.randomUUID(),planId:planId||undefined } : {}) });
      window.location.assign(stripeDestination(result.url));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a assinatura.'); setBusy(false); }
  }
  return <section><h2>Assinatura{config?.testMode ? " · teste" : ""}</h2>{config?.testMode&&<p>Este ambiente simula a assinatura de Gestão Contratual. Nenhum pagamento real é realizado.</p>}{error && <p role="alert" className={s.error}>{error}</p>}{config ? <><p>{config.adminExempt ? 'Administrador com acesso de validação.' : config.subscription ? `Situação Stripe: ${status[config.subscription.status] ?? config.subscription.status}` : 'Sem assinatura Stripe.'}</p>{config.profileStatus&&config.profileStatus!=='ACTIVE'&&<p className={s.notice}>O acesso ao produto está suspenso ou encerrado. Consulte o administrador.</p>}{config.manual&&<p>Licença manual: {({TRIALING:'Em teste',ACTIVE:'Ativa',MANUAL_CONTRACT:'Contrato manual',CANCELED:'Cancelada',PAST_DUE:'Inadimplente',UNPAID:'Não paga'} as Record<string,string>)[config.manual.status]||config.manual.status} · {config.manual.currentPeriodEnd?'validade até '+new Date(config.manual.currentPeriodEnd).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'sem prazo definido'}. A validade e o perfil de acesso determinam a autorização.</p>}{config.subscription?.currentPeriodEnd && <p>Fim do período Stripe: {new Date(config.subscription.currentPeriodEnd).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{config.subscription.cancelAtPeriodEnd ? ' · cancelamento programado' : ''}</p>}{config.message && <p>{config.message}</p>}{config.prerequisite?.required&&<p role="status" className={s.notice}>{config.prerequisite.message}</p>}{!config.configured && <p>A configuração de cobrança ainda está pendente.</p>}{!!config.plans?.length&&<label>{config.testMode ? "Plano de teste" : "Plano"}<select value={planId} onChange={e=>setPlanId(e.target.value)}>{!config.plans?.length&&<option value="">Plano padrão de validação</option>}{config.plans.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.priceBrl)} / {p.billingInterval==='YEAR'?'ano':'mês'}</option>)}</select></label>}<div className={s.actions}><button className={s.button} disabled={busy || !config.configured || !config.canCheckout} onClick={() => void redirect('checkout')}>{config.testMode ? "Simular assinatura" : "Assinar Gestão Contratual"}</button><button className={s.button} disabled={busy || !config.configured || !config.canPortal} onClick={() => void redirect('portal')}>{config.testMode ? "Gerenciar teste" : "Gerenciar assinatura"}</button></div></> : !error && <p role="status">Consultando assinatura…</p>}</section>;
}

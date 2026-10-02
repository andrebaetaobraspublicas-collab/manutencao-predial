'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import styles from '../workspace.module.css';

type Plan = { id: string; name: string; billingInterval: 'MONTH' | 'YEAR'; priceBrl: string; stripePriceId: string | null };
type Subscription = { status: string; billingSource: string; currentPeriodEnd: string | null; stripeCustomerId: string | null; cancelAtPeriodEnd: boolean; plan: Plan | null };
const labels: Record<string, string> = { ACTIVE: 'Ativa', TRIALING: 'Em teste', MANUAL_CONTRACT: 'Contrato manual', PAST_DUE: 'Inadimplente', UNPAID: 'Não paga', CANCELED: 'Cancelada' };

export default function SubscriptionPage() {
  const [data, setData] = useState<{ subscription: Subscription | null; integration: { keyConfigured: boolean; webhookConfigured: boolean } } | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let active = true;
    Promise.all([apiFetch<NonNullable<typeof data>>('/orcapro/billing'), apiFetch<Plan[]>('/orcapro/billing/plans')]).then(([result, prices]) => { if (active) { setData(result); setPlans(prices); } }).catch(cause => { if (!active) return; if (cause instanceof ApiError && cause.status === 401) { window.location.replace('/login?next=/orcapro'); return; } setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a assinatura.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function open(path: string, planId?: string) {
    setBusy(true); setError('');
    try {
      const result = await apiFetch<{ url: string | null }>(path, { method: 'POST', body: JSON.stringify(planId ? { planId } : {}) });
      if (!result.url) throw new Error('O Stripe não retornou um endereço válido.');
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('Endereço de contratação inválido.');
      window.location.assign(url.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o Stripe.'); setBusy(false); }
  }
  if (loading) return <main className={styles.loading}>Consultando sua assinatura…</main>;
  const stripeReady = data?.integration.keyConfigured && data?.integration.webhookConfigured;
  return <div className={styles.workspace}><main className={styles.main}><header className={styles.topbar}><h1>Minha assinatura OrçaPro</h1><Link href="/orcapro">Voltar ao editor</Link><Link href="/programas">Trocar programa</Link></header><div className={styles.content}>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {data ? <section className={styles.panel}><h2>{data.subscription?.plan?.name ?? (data.subscription ? 'Plano não definido' : 'Acesso existente')}</h2><p>Situação: {data.subscription ? labels[data.subscription.status] : 'Acesso anterior ao controle de assinaturas'}</p><p>Validade: {data.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem vencimento registrado'}</p>{data.subscription?.cancelAtPeriodEnd ? <p>A renovação automática está cancelada para o fim do período pago.</p> : null}<p>Esta assinatura é individual e exclusiva do OrçaPro. O Gestão de Prédios possui contratação independente.</p>{data.subscription?.stripeCustomerId ? <button disabled={busy || !stripeReady} onClick={() => open('/orcapro/billing/portal')}>Gerenciar cobrança no Stripe</button> : null}</section> : null}
    <section className={styles.panel}><h2>Planos disponíveis</h2>{!stripeReady ? <p>A contratação automática ainda depende da configuração do Stripe. Para ativar ou renovar pelo controle manual, entre em contato com o administrador do sistema.</p> : null}<div className={styles.tablewrap}><table><thead><tr><th>Plano</th><th>Valor por usuário</th><th /></tr></thead><tbody>{plans.map(plan => <tr key={plan.id}><td>{plan.name}</td><td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(plan.priceBrl))} / {plan.billingInterval === 'MONTH' ? 'mês' : 'ano'}</td><td><button disabled={busy || !stripeReady || !plan.stripePriceId} onClick={() => open('/orcapro/billing/checkout', plan.id)}>Ver contratação no Stripe</button></td></tr>)}</tbody></table></div>{!plans.length ? <p>Os planos ainda não foram definidos pelo administrador.</p> : null}</section>
  </div></main></div>;
}

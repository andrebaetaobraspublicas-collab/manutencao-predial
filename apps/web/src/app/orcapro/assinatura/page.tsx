'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { endSession } from '@/lib/end-session';
import { ORCAPRO_ONLY, stripeDestination } from '@/lib/product-config';
import { stripeSubscriptionConfirmed } from '@/lib/stripe-status';
import styles from '../workspace.module.css';

type Plan = { id: string; name: string; billingInterval: 'MONTH' | 'YEAR'; priceBrl: string; stripePriceId: string | null };
type Subscription = { status: string; billingSource: string; currentPeriodEnd: string | null; stripeCustomerId: string | null; cancelAtPeriodEnd: boolean; plan: Plan | null };
const labels: Record<string, string> = { ACTIVE: 'Ativa', TRIALING: 'Em teste', MANUAL_CONTRACT: 'Contrato manual', PAST_DUE: 'Inadimplente', UNPAID: 'Não paga', CANCELED: 'Cancelada' };

export default function SubscriptionPage() {
  const [data, setData] = useState<{ subscription: Subscription | null; integration: { keyConfigured: boolean; webhookConfigured: boolean; mode?: string } } | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [checkoutReturn, setCheckoutReturn] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let refreshCount = 0;
    const returned = new URLSearchParams(window.location.search).get('checkout') ?? '';
    async function load() {
      try {
        const [result, prices] = await Promise.all([apiFetch<NonNullable<typeof data>>('/orcapro/billing'), apiFetch<Plan[]>('/orcapro/billing/plans')]);
        if (!active) return;
        setData(result); setPlans(prices); setCheckoutReturn(returned); setError('');
        if (returned === 'success' && !stripeSubscriptionConfirmed(result.subscription) && refreshCount++ < 10) timer = setTimeout(() => void load(), 6000);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) { window.location.replace('/login?next=/orcapro'); return; }
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a assinatura.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [attempt]);
  async function open(path: string, planId?: string) {
    setBusy(true); setError('');
    try {
      const result = await apiFetch<{ url: string | null }>(path, { method: 'POST', body: JSON.stringify(planId ? { planId } : {}) });
      window.location.assign(stripeDestination(result.url));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o Stripe.'); setBusy(false); }
  }
  if (loading) return <main className={styles.loading}>Consultando sua assinatura…</main>;
  const stripeReady = data?.integration.keyConfigured && data?.integration.webhookConfigured;
  const confirmed = stripeSubscriptionConfirmed(data?.subscription);
  async function logout() { if (busy) return; setBusy(true); setError(''); try { await endSession('/login?next=/orcapro'); } catch { setError('Não foi possível encerrar a sessão. Tente novamente.'); setBusy(false); } }
  return <div className={styles.workspace}><main className={styles.main}><header className={styles.topbar}><h1>Minha assinatura OrçaPro</h1><Link href="/orcapro">Voltar ao editor</Link>{!ORCAPRO_ONLY ? <Link href="/programas">Trocar programa</Link> : null}<button disabled={busy} onClick={() => void logout()}>Sair</button></header><div className={styles.content}>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {checkoutReturn === 'success' ? <section className={styles.panel} role="status"><h2>{confirmed ? 'Assinatura confirmada' : 'Aguardando confirmação do Stripe'}</h2><p>{confirmed ? 'O sistema recebeu a confirmação da sua assinatura. Você já pode abrir o editor.' : 'Estamos consultando a confirmação do pagamento. O retorno da página do Stripe, sozinho, não libera o acesso.'}</p>{confirmed ? <Link href="/orcapro">Abrir OrçaPro</Link> : <button disabled={busy} onClick={() => setAttempt(value => value + 1)}>Verificar confirmação novamente</button>}</section> : null}
    {checkoutReturn === 'canceled' ? <p className={styles.notice} role="status">A contratação foi interrompida. Sua conta permite escolher um plano e retomar o pagamento.</p> : null}
    {data?.integration.mode === 'TEST' ? <p className={styles.notice} role="status">Ambiente de testes do Stripe. As contratações nesta configuração não representam pagamentos reais.</p> : null}
    {data ? <section className={styles.panel}><h2>{data.subscription?.plan?.name ?? (data.subscription ? 'Plano não definido' : 'Acesso existente')}</h2><p>Situação: {data.subscription ? labels[data.subscription.status] : 'Acesso anterior ao controle de assinaturas'}</p><p>Validade: {data.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem vencimento registrado'}</p>{data.subscription?.cancelAtPeriodEnd ? <p>A renovação automática está cancelada para o fim do período pago.</p> : null}<p>Esta assinatura é individual e exclusiva do OrçaPro.{!ORCAPRO_ONLY ? ' O Gestão de Prédios possui contratação independente.' : ''}</p>{data.subscription?.billingSource === 'MANUAL' ? <p>O seu acesso é administrado diretamente pelo OrçaPro. Alterar uma cobrança no Stripe não modifica automaticamente esse controle manual.</p> : null}{data.subscription?.stripeCustomerId ? <button disabled={busy || !stripeReady} onClick={() => open('/orcapro/billing/portal')}>Gerenciar cobrança no Stripe</button> : null}</section> : null}
    <section className={styles.panel}><h2>Planos disponíveis</h2>{!stripeReady ? <p>A contratação automática ainda depende da configuração do Stripe. Para ativar ou renovar pelo controle manual, entre em contato com o administrador do sistema.</p> : null}<div className={styles.tablewrap}><table><thead><tr><th>Plano</th><th>Valor por usuário</th><th /></tr></thead><tbody>{plans.map(plan => <tr key={plan.id}><td>{plan.name}</td><td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(plan.priceBrl))} / {plan.billingInterval === 'MONTH' ? 'mês' : 'ano'}</td><td><button disabled={busy || !stripeReady || !plan.stripePriceId} onClick={() => open('/orcapro/billing/checkout', plan.id)}>Ver contratação no Stripe</button></td></tr>)}</tbody></table></div>{!plans.length ? <p>Os planos ainda não foram definidos pelo administrador.</p> : null}</section>
  </div></main></div>;
}

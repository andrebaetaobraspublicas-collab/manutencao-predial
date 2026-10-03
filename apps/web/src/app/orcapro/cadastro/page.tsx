'use client';

import { ArrowRight, Calculator, Check, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { endSession } from '@/lib/end-session';
import { exitDestination, stripeDestination } from '@/lib/product-config';

type PublicPlan = { id: string; name: string; billingInterval: 'MONTH' | 'YEAR'; priceBrl: string };
type PublicPlans = { plans: PublicPlan[]; integration: { keyConfigured: boolean; webhookConfigured: boolean; mode?: string } };
type Registration = { checkoutUrl: string | null; checkoutError?: string };

const amount = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));

export default function OrcaproSignupPage() {
  const [catalog, setCatalog] = useState<PublicPlans | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<PublicPlans>('/orcapro/billing/public/plans', { signal: controller.signal }, false)
      .then(data => { setCatalog(data); setPlanId(data.plans[0]?.id ?? ''); })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : 'Não foi possível consultar os planos. Tente novamente.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const stripeReady = catalog?.integration.keyConfigured && catalog?.integration.webhookConfigured;
  const selected = catalog?.plans.find(plan => plan.id === planId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || registered) return;
    setError('');
    if (!selected || !stripeReady) { setError('Selecione um plano disponível para contratação.'); return; }
    if (password !== confirmation) { setError('A confirmação não corresponde à senha.'); return; }
    if (new TextEncoder().encode(password).length > 72) { setError('A senha deve ter no máximo 72 bytes. Use menos caracteres se houver acentos ou símbolos.'); return; }
    setSubmitting(true);
    try {
      const result = await apiFetch<Registration>('/orcapro/billing/public/register', {
        method: 'POST', body: JSON.stringify({ name: name.trim(), email: email.trim(), password, planId }),
      }, false);
      setPassword(''); setConfirmation(''); setRegistered(true);
      if (!result.checkoutUrl) {
        setError(result.checkoutError || 'Sua conta foi criada. Retome a contratação em Minha assinatura.');
        setSubmitting(false); return;
      }
      window.location.assign(stripeDestination(result.checkoutUrl));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir o cadastro.');
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (submitting) return;
    if (!registered) { window.location.assign(exitDestination('/login?next=/orcapro')); return; }
    setSubmitting(true); setError('');
    try { await endSession('/login?next=/orcapro'); }
    catch { setError('Não foi possível encerrar a sessão. Tente novamente.'); setSubmitting(false); }
  }

  return <main className="login-page orcapro-auth orcapro-signup">
    <section className="login-visual" aria-label="Como contratar o OrçaPro">
      <div className="login-logo"><div className="brand-mark"><Calculator size={26} /></div><div><strong>OrçaPro</strong><small>Orçamentos e planejamento de obras</small></div></div>
      <div className="login-message"><h1>Seu próximo orçamento começa aqui.</h1><p>SINAPI, BDI, cronograma e análise de riscos com a referência de cada projeto preservada.</p>
        <ol className="signup-steps"><li><span>1</span><div><strong>Escolha seu plano</strong><small>Assinatura individual do OrçaPro.</small></div></li><li><span>2</span><div><strong>Crie sua conta</strong><small>Seu e-mail será usado para entrar no sistema.</small></div></li><li><span>3</span><div><strong>Conclua no Stripe</strong><small>Confira o valor e a renovação antes de pagar.</small></div></li></ol>
      </div>
      <div className="login-feature-list"><span>SINAPI</span><span>BDI</span><span>Monte Carlo</span><span>Cronograma</span></div>
    </section>
    <section className="login-panel"><div className="login-card">
      <h2>{registered ? 'Conta criada' : 'Assinar o OrçaPro'}</h2>
      <p>{registered ? 'A contratação ainda precisa ser confirmada. Sua conta permite retomar o pagamento.' : 'Escolha o plano e crie suas credenciais. O pagamento acontece na página segura do Stripe.'}</p>
      {catalog?.integration.mode === 'TEST' ? <div className="notice" role="status">Ambiente de testes do Stripe. Esta configuração não realiza cobranças reais.</div> : null}
      {loading ? <p role="status">Consultando os planos disponíveis…</p> : registered ? <><div className="notice"><Check size={18} /> Conta criada para {email}. O acesso contratado será liberado após a confirmação do pagamento pelo Stripe.</div>{error ? <p className="notice error" role="alert">{error}</p> : null}<Link className="btn btn-primary" href="/orcapro/assinatura">Retomar contratação <ArrowRight size={18} /></Link></> : <>
        {!stripeReady || !catalog?.plans.length ? <div className="notice" role="status">A contratação pela internet ainda não está disponível. Se você já comprou diretamente, entre com a conta fornecida pelo administrador.</div> : null}
        <form className="login-form" onSubmit={submit}>
          <div className="field"><label htmlFor="plan">Plano individual</label><select id="plan" className="select" value={planId} onChange={event => setPlanId(event.target.value)} required disabled={submitting || !stripeReady || !catalog?.plans.length}><option value="" disabled>Selecione um plano</option>{catalog?.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {amount(plan.priceBrl)} / {plan.billingInterval === 'MONTH' ? 'mês' : 'ano'}</option>)}</select></div>
          {selected ? <div className="signup-plan-summary"><strong>{selected.name}</strong><span>{amount(selected.priceBrl)} por usuário / {selected.billingInterval === 'MONTH' ? 'mês' : 'ano'}</span><small>Renovação automática conforme as condições apresentadas no Stripe. Esta assinatura é exclusiva do OrçaPro.</small></div> : null}
          <div className="field"><label htmlFor="name">Nome completo</label><input id="name" className="input" required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={event => setName(event.target.value)} disabled={submitting} /></div>
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" required type="email" maxLength={190} autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} disabled={submitting} /></div>
          <div className="field"><label htmlFor="password">Crie uma senha</label><div className="signup-password"><input id="password" className="input" required type={showPassword ? 'text' : 'password'} minLength={10} maxLength={72} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={submitting} /><button className="btn btn-ghost" type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><small>De 10 a 72 caracteres. Use uma senha exclusiva.</small></div>
          <div className="field"><label htmlFor="confirmation">Confirme a senha</label><input id="confirmation" className="input" required type="password" minLength={10} maxLength={72} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={submitting} /></div>
          {error ? <div className="notice error" role="alert">{error}</div> : null}
          <button className="btn btn-primary" disabled={submitting || loading || !stripeReady || !selected}>{submitting ? 'Criando conta e abrindo pagamento…' : 'Criar conta e continuar para pagamento'}<ArrowRight size={18} /></button>
          <p className="signup-payment-note">Os dados de pagamento são informados diretamente ao Stripe. Criar a conta não confirma a compra.</p>
        </form>
      </>}
      <div className="signup-footer"><Link className="auth-link" href="/login?next=/orcapro">Já tenho conta · Entrar no sistema</Link><button className="auth-link" type="button" disabled={submitting} onClick={() => void cancel()}>Cancelar e voltar ao site</button></div>
    </div></section>
  </main>;
}

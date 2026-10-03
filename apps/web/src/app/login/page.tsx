'use client';

import { Building2, Calculator, Eye, EyeOff, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import { exitDestination, loginDestination, ORCAPRO_ONLY, PRODUCT_DOMAIN, PRODUCT_NAME, type LoginDestination } from '@/lib/product-config';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [destination, setDestination] = useState<LoginDestination>(
    () => loginDestination(searchParams.get('next')),
  );
  const [tenantSlug, setTenantSlug] = useState(ORCAPRO_ONLY ? '' : 'demonstracao');
  const [email, setEmail] = useState(ORCAPRO_ONLY ? '' : 'admin@gestaodepredios.com.br');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const session = await apiFetch<{ user: { maintenanceAccess?: boolean } }>(ORCAPRO_ONLY ? '/auth/orcapro/login' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(ORCAPRO_ONLY ? { email, password } : { tenantSlug, email, password }),
      });
      setPassword('');
      let next: string = destination === '/dashboard' && session.user.maintenanceAccess === false ? '/programas' : destination;
      if (destination === '/orcapro') {
        try {
          const access = await apiFetch<{ enabled: boolean }>('/orcapro/access');
          if (access.enabled !== true) next = ORCAPRO_ONLY ? '/orcapro/assinatura' : '/programas';
        } catch {
          next = ORCAPRO_ONLY ? '/orcapro/assinatura' : '/programas';
        }
      }
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível acessar o sistema.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`login-page${ORCAPRO_ONLY ? ' orcapro-auth' : ''}`}>
      <section className="login-visual" aria-label="Apresentação do sistema">
        <div className="login-logo">
          <div className="brand-mark">{ORCAPRO_ONLY ? <Calculator size={26} /> : <Building2 size={26} />}</div>
          <div><strong>{PRODUCT_NAME}</strong><small>{PRODUCT_DOMAIN}</small></div>
        </div>
        <div className="login-message">
          <h1>{ORCAPRO_ONLY ? 'Da composição ao planejamento da obra.' : 'Uma conta. Dois programas.'}</h1>
          <p>
            {ORCAPRO_ONLY ? 'Prepare orçamentos com SINAPI, forme o BDI e planeje prazos, equipes e contingências em um só lugar.' : 'Gerencie a manutenção no Gestão de Prédios e prepare seus orçamentos de obras no OrçaPro, com os acessos da sua organização.'}
          </p>
        </div>
        <div className="login-feature-list">
          {!ORCAPRO_ONLY ? <><span>Gestão de Prédios</span><span>OrçaPro</span><span>Manutenção</span></> : <><span>BDI</span><span>Cronograma</span><span>Riscos e contingências</span></>}
          <span>Orçamentos de obras</span><span>SINAPI</span><span>Auditoria</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h2>{ORCAPRO_ONLY ? 'Entrar no OrçaPro' : 'Acesse sua organização'}</h2>
          <p>{ORCAPRO_ONLY ? 'Use o e-mail e a senha da sua conta.' : 'Informe o identificador da empresa e suas credenciais pessoais.'}</p>
          {ORCAPRO_ONLY ? <p>Se você contratou diretamente, use o e-mail e a senha cadastrados pelo administrador.</p> : null}
          <form className="login-form" onSubmit={handleSubmit}>
            {!ORCAPRO_ONLY ? <><div className="field">
              <label htmlFor="program">Programa</label>
              <select
                className="select"
                id="program"
                value={destination}
                onChange={(event) => setDestination(loginDestination(event.target.value))}
                disabled={submitting}
              >
                <option value="/dashboard">Gestão de Prédios — manutenção</option>
                <option value="/orcapro">OrçaPro — orçamentos de obras</option>
                <option value="/programas">Escolher após entrar</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="tenantSlug">Organização</label>
              <input
                className="input"
                id="tenantSlug"
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
                autoComplete="organization"
                required
              />
            </div></> : null}
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input
                className="input"
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: 45 }}
                />
                <button
                  className="btn btn-ghost"
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((value) => !value)}
                  style={{ position: 'absolute', right: 2, top: 2, minHeight: 36, padding: '8px 10px' }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {error ? <div className="notice error" role="alert">{error}</div> : null}
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              <LogIn size={18} /> {submitting ? 'Entrando…' : 'Entrar'}
            </button>
            <Link className="auth-link" href="/esqueci-senha">Esqueci minha senha</Link>
            {ORCAPRO_ONLY ? <Link className="auth-link" href="/orcapro/cadastro">Ainda não tenho conta · Assinar o OrçaPro</Link> : null}
            {ORCAPRO_ONLY ? <button className="auth-link auth-cancel" type="button" disabled={submitting} onClick={() => window.location.assign(exitDestination())}>Cancelar e voltar ao site</button> : null}
          </form>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Preparando acesso…" />}>
      <LoginContent />
    </Suspense>
  );
}

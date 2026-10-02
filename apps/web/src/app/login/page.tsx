'use client';

import { Building2, Eye, EyeOff, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';

type LoginDestination = '/dashboard' | '/orcapro' | '/programas';

function safeDestination(value: string | null): LoginDestination {
  return value === '/orcapro' || value === '/programas' ? value : '/dashboard';
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [destination, setDestination] = useState<LoginDestination>(
    () => safeDestination(searchParams.get('next')),
  );
  const [tenantSlug, setTenantSlug] = useState('demonstracao');
  const [email, setEmail] = useState('admin@gestaodepredios.com.br');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug, email, password }),
      });
      setPassword('');
      let next = destination;
      if (destination === '/orcapro') {
        try {
          const access = await apiFetch<{ enabled: boolean }>('/orcapro/access');
          if (access.enabled !== true) next = '/programas';
        } catch {
          next = '/programas';
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
    <main className="login-page">
      <section className="login-visual" aria-label="Apresentação do sistema">
        <div className="login-logo">
          <div className="brand-mark"><Building2 size={26} /></div>
          <div><strong>Gestão de Prédios</strong><small>gestaodepredios.com.br</small></div>
        </div>
        <div className="login-message">
          <h1>Uma conta. Dois programas.</h1>
          <p>
            Gerencie a manutenção no Gestão de Prédios e prepare seus orçamentos de obras
            no OrçaPro, com os acessos da sua organização.
          </p>
        </div>
        <div className="login-feature-list">
          <span>Gestão de Prédios</span><span>OrçaPro</span><span>Manutenção</span>
          <span>Orçamentos de obras</span><span>SINAPI</span><span>Auditoria</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h2>Acesse sua organização</h2>
          <p>Informe o identificador da empresa e suas credenciais pessoais.</p>
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="program">Programa</label>
              <select
                className="select"
                id="program"
                value={destination}
                onChange={(event) => setDestination(safeDestination(event.target.value))}
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
            </div>
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

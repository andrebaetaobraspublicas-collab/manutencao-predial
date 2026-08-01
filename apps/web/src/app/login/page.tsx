'use client';

import { Building2, Eye, EyeOff, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
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
      router.replace('/dashboard');
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
          <h1>A manutenção começa pela ordem certa.</h1>
          <p>
            Centralize demandas, backlog, contratos, fornecedores e execução financeira em uma
            visão operacional única, rastreável e orientada por indicadores.
          </p>
        </div>
        <div className="login-feature-list">
          <span>Ordens de serviço</span><span>Backlog analítico</span><span>Contratos</span>
          <span>Georreferenciamento</span><span>KPIs e SLAs</span><span>Auditoria</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h2>Acesse sua organização</h2>
          <p>Informe o identificador da empresa e suas credenciais pessoais.</p>
          <form className="login-form" onSubmit={handleSubmit}>
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
          </form>
        </div>
      </section>
    </main>
  );
}

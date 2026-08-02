'use client';

import { Building2, Mail } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError('');
    try {
      await apiFetch('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível concluir a solicitação.');
    } finally { setSubmitting(false); }
  }

  return <main className="simple-auth-page"><section className="login-card auth-card"><div className="auth-brand"><Building2 size={24} /> Gestão de Prédios</div><h1>Recuperar acesso</h1><p>Informe seu e-mail. Se houver uma conta ativa, enviaremos um link válido por uma hora.</p>{sent ? <div className="notice">Solicitação registrada. Verifique sua caixa de entrada e a pasta de spam.</div> : <form className="login-form" onSubmit={submit}><div className="field"><label htmlFor="email">E-mail</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>{error ? <div className="notice error">{error}</div> : null}<button className="btn btn-primary" disabled={submitting}><Mail size={17} /> {submitting ? 'Solicitando…' : 'Enviar link'}</button></form>}<Link className="auth-link" href="/login">Voltar para o acesso</Link></section></main>;
}

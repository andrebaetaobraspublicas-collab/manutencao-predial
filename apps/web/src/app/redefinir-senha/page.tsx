'use client';

import { Building2, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  // The token exists only in the browser URL and must be copied after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') ?? ''); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!token) { setError('O link não contém um token válido.'); return; }
    if (password !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, newPassword: password }) });
      setDone(true);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Não foi possível redefinir a senha.'); }
    finally { setSubmitting(false); }
  }

  return <main className="simple-auth-page"><section className="login-card auth-card"><div className="auth-brand"><Building2 size={24} /> Gestão de Prédios</div><h1>Criar nova senha</h1><p>Depois da alteração, todas as sessões anteriores serão encerradas.</p>{done ? <><div className="notice">Senha alterada com sucesso. Você já pode entrar novamente.</div><Link className="btn btn-primary" href="/login">Ir para o acesso</Link></> : <form className="login-form" onSubmit={submit}><div className="field"><label htmlFor="password">Nova senha</label><input id="password" className="input" type="password" minLength={10} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /><small>Mínimo de 10 caracteres.</small></div><div className="field"><label htmlFor="confirmation">Confirmar nova senha</label><input id="confirmation" className="input" type="password" minLength={10} autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>{error ? <div className="notice error">{error}</div> : null}<button className="btn btn-primary" disabled={submitting}><KeyRound size={17} /> {submitting ? 'Alterando…' : 'Redefinir senha'}</button></form>}</section></main>;
}

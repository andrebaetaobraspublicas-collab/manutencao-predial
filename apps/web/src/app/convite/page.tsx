'use client';

import { Building2, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

type InvitationInfo = { email: string; tenant: { name: string; slug: string }; role: string; expiresAt: string; requiresAccountSetup: boolean };

export default function InvitationPage() {
  const [token, setToken] = useState('');
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') ?? '';
    // The token exists only in the browser URL and must be copied after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value);
    if (!value) { setError('O link não contém um convite válido.'); setLoading(false); return; }
    void apiFetch<InvitationInfo>('/auth/invitations/inspect', { method: 'POST', body: JSON.stringify({ token: value }) })
      .then(setInfo)
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Convite inválido.'))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (info?.requiresAccountSetup && password !== confirmation) { setError('A confirmação não corresponde à senha.'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/auth/invitations/accept', { method: 'POST', body: JSON.stringify({ token, name: info?.requiresAccountSetup ? name : undefined, password: info?.requiresAccountSetup ? password : undefined }) });
      setDone(true);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Não foi possível aceitar o convite.'); }
    finally { setSubmitting(false); }
  }

  return <main className="simple-auth-page"><section className="login-card auth-card"><div className="auth-brand"><Building2 size={24} /> Gestão de Prédios</div><h1>Aceitar convite</h1>{loading ? <p>Validando convite…</p> : done ? <><div className="notice">Acesso ativado para {info?.tenant.name}. Entre usando a organização <strong>{info?.tenant.slug}</strong>.</div><Link className="btn btn-primary" href="/login">Entrar no sistema</Link></> : info ? <><p>Você foi convidado como <strong>{info.role.toLowerCase().replaceAll('_', ' ')}</strong> em <strong>{info.tenant.name}</strong>.</p><form className="login-form" onSubmit={submit}>{info.requiresAccountSetup ? <><div className="field"><label htmlFor="name">Nome completo</label><input id="name" className="input" required minLength={3} value={name} onChange={(e) => setName(e.target.value)} /></div><div className="field"><label htmlFor="password">Crie uma senha</label><input id="password" className="input" type="password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="field"><label htmlFor="confirmation">Confirme a senha</label><input id="confirmation" className="input" type="password" minLength={10} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div></> : <div className="notice">A conta {info.email} já existe. O convite apenas adicionará esta organização ao seu acesso.</div>}{error ? <div className="notice error">{error}</div> : null}<button className="btn btn-primary" disabled={submitting}><UserCheck size={17} /> {submitting ? 'Ativando…' : 'Aceitar convite'}</button></form></> : <div className="notice error">{error}</div>}</section></main>;
}

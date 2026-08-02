'use client';

import { KeyRound, MailCheck, Save } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { CurrentSession } from '@/lib/types';

export default function AccountPage() {
  const router = useRouter();
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { void apiFetch<CurrentSession>('/auth/me').then(setSession); }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (newPassword !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      router.replace('/login?passwordChanged=1'); router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível alterar a senha.');
    } finally { setSubmitting(false); }
  }

  async function requestVerification() {
    setError(''); setMessage('');
    try {
      const result = await apiFetch<{ alreadyVerified: boolean }>('/auth/email-verification/request', { method: 'POST' });
      setMessage(result.alreadyVerified ? 'Seu e-mail já está verificado.' : 'Enviamos um link de confirmação para seu e-mail.');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Não foi possível enviar a confirmação.'); }
  }

  return <div className="page-container">
    <header className="page-header"><div className="page-title"><h1>Minha conta</h1><p>Segurança da conta global e confirmação do endereço de e-mail.</p></div></header>
    {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}
    {message ? <div className="notice" style={{ marginBottom: 18 }}>{message}</div> : null}
    <div className="grid-2">
      <form className="card" onSubmit={changePassword}>
        <div className="card-header"><div><h2>Alterar senha</h2><p>A alteração encerra todas as sessões, inclusive esta.</p></div><KeyRound size={19} /></div>
        <div className="form-section"><div className="field"><label htmlFor="currentPassword">Senha atual</label><input id="currentPassword" className="input" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div><div className="field" style={{ marginTop: 14 }}><label htmlFor="newPassword">Nova senha</label><input id="newPassword" className="input" type="password" minLength={10} autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><small>Use pelo menos 10 caracteres e uma senha exclusiva.</small></div><div className="field" style={{ marginTop: 14 }}><label htmlFor="confirmation">Confirmar nova senha</label><input id="confirmation" className="input" type="password" minLength={10} autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div></div>
        <div className="form-footer"><button className="btn btn-primary" disabled={submitting}><Save size={16} /> {submitting ? 'Alterando…' : 'Alterar senha'}</button></div>
      </form>
      <section className="card">
        <div className="card-header"><div><h2>Verificação de e-mail</h2><p>O endereço confirmado será usado para convites e recuperação de acesso.</p></div><MailCheck size={19} /></div>
        <div className="form-section"><strong>{session?.user.email ?? 'Carregando…'}</strong><p style={{ margin: '8px 0 0', color: 'var(--text-soft)', fontSize: '.78rem' }}>Situação: {session?.user.status?.toLowerCase() ?? '—'}</p></div>
        <div className="form-footer"><button className="btn btn-secondary" type="button" onClick={() => void requestVerification()}><MailCheck size={16} /> Verificar e-mail</button></div>
      </section>
    </div>
  </div>;
}

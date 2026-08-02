'use client';

import { Building2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

export default function VerifyEmailPage() {
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    // This client-only flow derives its initial state from the browser URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!token) { setMessage('O link não contém um token válido.'); setState('error'); return; }
    void apiFetch('/auth/email-verification/confirm', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => setState('done'))
      .catch((cause) => { setMessage(cause instanceof ApiError ? cause.message : 'Não foi possível confirmar o e-mail.'); setState('error'); });
  }, []);
  return <main className="simple-auth-page"><section className="login-card auth-card"><div className="auth-brand"><Building2 size={24} /> Gestão de Prédios</div><MailCheck size={38} className="auth-hero-icon"/><h1>Verificação de e-mail</h1>{state === 'loading' ? <p>Confirmando seu endereço…</p> : state === 'done' ? <div className="notice">E-mail confirmado com sucesso.</div> : <div className="notice error">{message}</div>}<Link className="auth-link" href="/login">Voltar para o acesso</Link></section></main>;
}

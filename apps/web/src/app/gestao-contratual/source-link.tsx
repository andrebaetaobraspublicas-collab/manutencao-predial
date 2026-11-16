'use client';
import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api';
import s from './contract.module.css';

export function SourceLink() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    setBusy(true); setMessage('');
    try {
      await apiFetch('/auth/gestao/sources', { method: 'POST', body: JSON.stringify({ product: fields.get('product'), password: fields.get('password') }) });
      form.reset(); setMessage('Origem vinculada. Atualize a Gestão Contratual para consultar os orçamentos e a elegibilidade da assinatura.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível vincular a origem.'); }
    finally { setBusy(false); }
  }
  return <form className={s.form} onSubmit={link} aria-label="Vincular assinatura de origem"><h2 className={s.wide}>Vincular outro orçamentador</h2><p className={s.wide}>Use a senha da conta de mesmo e-mail no sistema escolhido. A consulta verifica sua assinatura e permite capturar seus orçamentos, sem alterar a origem.</p><label>Programa<select name="product" disabled={busy}><option value="ORCAPRO">OrçaPro</option><option value="INFRA">OrçaPro Infraestrutura</option></select></label><label>Senha da conta de origem<input name="password" type="password" autoComplete="off" required maxLength={128} disabled={busy}/></label><div className={s.wide}><button className={s.button} disabled={busy}>{busy ? 'Conferindo…' : 'Vincular assinatura'}</button></div>{message&&<p className={s.wide} role="status">{message}</p>}</form>;
}

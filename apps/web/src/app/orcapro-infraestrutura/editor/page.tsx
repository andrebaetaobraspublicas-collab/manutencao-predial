'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { infraAccess } from '@/lib/infra-api';
import { endSession } from '@/lib/end-session';
import { ORCAPRO_ONLY } from '@/lib/product-config';
import styles from '../../orcapro/editor/editor.module.css';

export default function InfraEditor() {
  const [id, setId] = useState(''), [admin, setAdmin] = useState(false), [status, setStatus] = useState('loading'), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (ORCAPRO_ONLY) return;
    const project = new URLSearchParams(window.location.search).get('id') || '';
    infraAccess().then(access => {
      if (!/^[0-9a-f-]{36}$/i.test(project)) throw new Error('Abra um orçamento na sua lista.');
      if (!access.enabled) throw new Error('Seu acesso ao Infraestrutura ainda não está ativo.');
      if (active) { setId(project); setAdmin(access.role === 'ADMIN'); setStatus('ready'); }
    }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) { window.location.assign('/login/?next=/orcapro-infraestrutura'); return; }
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o editor.');
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const frame = document.getElementById('infra-editor') as HTMLIFrameElement | null;
      if (event.origin !== window.location.origin || event.source !== frame?.contentWindow || event.data?.type !== 'infra-save') return;
      if (['saving', 'saved', 'conflict', 'error'].includes(event.data.status)) { setStatus(event.data.status); setError(typeof event.data.message === 'string' ? event.data.message : ''); }
    };
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
  }, []);
  async function flush() {
    const frame = document.getElementById('infra-editor') as HTMLIFrameElement | null;
    if (!frame?.contentWindow) return;
    await new Promise<void>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const listener = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.type !== 'infra-flush-result' || event.data.requestId !== requestId) return;
        cleanup(); if (event.data.ok) resolve(); else reject(new Error(event.data.message || 'Resolva a gravação pendente antes de sair.'));
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('A gravação ainda não foi confirmada. Aguarde o carregamento do editor e tente novamente.')); }, 20000);
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', listener); };
      window.addEventListener('message', listener); frame.contentWindow?.postMessage({ type: 'infra-flush', requestId }, window.location.origin);
    });
  }
  async function navigate(path: string) { try { await flush(); window.location.assign(path); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gravação pendente.'); } }
  async function leave() { try { await flush(); await endSession('/login?next=/orcapro-infraestrutura'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível encerrar a sessão.'); } }
  return <main className={styles.editor}>
    <header><Link href="/orcapro-infraestrutura/gerenciar" onClick={e => { e.preventDefault(); void navigate('/orcapro-infraestrutura/gerenciar'); }}>← Meus orçamentos</Link><strong>OrçaPro Infraestrutura</strong><span role="status">{status === 'saving' ? 'Salvando…' : status === 'saved' ? 'Salvo no servidor' : status === 'conflict' ? 'Conflito de versão' : status === 'error' ? 'Gravação pendente' : 'SICRO · projeto privado'}</span>{admin ? <Link className={styles.adminLink} href="/orcapro-infraestrutura/administracao" onClick={e => { e.preventDefault(); void navigate('/orcapro-infraestrutura/administracao'); }}>Administração</Link> : null}<Link href="/programas" onClick={e => { e.preventDefault(); void navigate('/programas'); }}>Trocar programa</Link><button className={styles.logout} disabled={status === 'saving'} onClick={() => void leave()}>Sair</button></header>
    {error ? <p className={styles.error} role="alert">{error}{status === 'conflict' ? ' Use Arquivo → Salvar alterações como cópia ou exporte JSON. O servidor preservou a outra versão.' : ''}</p> : null}
    {id && !ORCAPRO_ONLY ? <iframe id="infra-editor" title="OrçaPro Infraestrutura — orçamento e planejamento SICRO" src={'/infraestrutura-editor/index.html?project=' + encodeURIComponent(id)} allow="clipboard-write" /> : <div className={styles.empty}><h1>OrçaPro Infraestrutura</h1><p>{ORCAPRO_ONLY ? 'Este programa está disponível no ambiente de desenvolvimento.' : error || 'Validando acesso…'}</p><Link href="/orcapro-infraestrutura/gerenciar">Meus orçamentos</Link></div>}
  </main>;
}

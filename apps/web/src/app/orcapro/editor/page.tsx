'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { endSession } from '@/lib/end-session';
import { ORCAPRO_ONLY } from '@/lib/product-config';
import styles from './editor.module.css';
import editorManifest from '../../../../public/orcapro-legacy/manifest.json';

type Status = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'conflict';

export default function OrcaproEditorPage() {
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [admin, setAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      const id = new URLSearchParams(window.location.search).get('id') ?? '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('Selecione um orçamento na sua lista para abrir o editor.');
      }
      const access = await apiFetch<{ enabled: boolean; role: string }>('/orcapro/access');
      if (!access.enabled) throw new Error('O OrçaPro ainda não está habilitado para sua conta.');
      if (active) { setProjectId(id); setStatus('ready'); setAdmin(access.role === 'ADMIN'); }
    }
    load()
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) { window.location.assign('/login?next=/orcapro'); return; }
        setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o orçamento.'); setStatus('error');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const listener = (event: MessageEvent) => {
      const frame = document.getElementById('orcapro-editor') as HTMLIFrameElement | null;
      if (event.origin !== window.location.origin || event.source !== frame?.contentWindow) return;
      if (event.data?.type === 'orcapro-save' && ['saving', 'saved', 'error', 'conflict'].includes(event.data.status)) {
        setStatus(event.data.status as Status);
        setError(typeof event.data.message === 'string' ? event.data.message : '');
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [projectId]);

  const statusText = status === 'loading' ? 'Validando acesso…' : status === 'saving' ? 'Salvando…' : status === 'saved' ? 'Salvo no servidor'
    : status === 'conflict' ? 'Conflito de versão: revise antes de salvar' : status === 'error' ? 'Não foi possível salvar ou abrir' : 'Orçamento vinculado à referência SINAPI';

  async function logout() {
    if (signingOut || status === 'saving') return;
    setSigningOut(true); setLogoutError('');
    try { await endSession('/login?next=/orcapro'); }
    catch { setLogoutError('Não foi possível encerrar a sessão. Tente novamente.'); setSigningOut(false); }
  }

  return <main className={styles.editor}>
    <header><Link href="/orcapro/gerenciar">← Meus orçamentos</Link><strong>OrçaPro</strong><span role="status" className={status === 'error' || status === 'conflict' ? styles.warning : ''}>{statusText}</span>{admin ? <Link className={styles.adminLink} href="/orcapro/administracao">Gestão do SaaS</Link> : null}<Link href="/orcapro/assinatura">Minha assinatura</Link>{!ORCAPRO_ONLY ? <Link href="/programas">Trocar programa</Link> : null}<button className={styles.logout} type="button" disabled={signingOut || status === 'saving'} onClick={() => void logout()}>{signingOut ? 'Saindo…' : 'Sair'}</button></header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {logoutError ? <p className={styles.error} role="alert">{logoutError}</p> : null}
    {projectId ? <iframe id="orcapro-editor" title="OrçaPro — editor de orçamento de obras" src={`/orcapro-legacy/editor.html?project=${encodeURIComponent(projectId)}&v=${editorManifest.editorSha256}`} allow="clipboard-write" />
      : <div className={styles.empty}><h1>OrçaPro</h1><p>{statusText}</p><Link href="/orcapro/gerenciar">Abrir lista de orçamentos</Link></div>}
  </main>;
}

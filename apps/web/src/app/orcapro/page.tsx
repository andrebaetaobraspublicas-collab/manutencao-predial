'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import styles from './editor/editor.module.css';

export default function OrcaproEntryPage() {
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function open() {
      try {
        return await apiFetch<{ id: string }>('/orcapro/workspace/open', { method: 'POST', body: '{}' });
      } catch (cause) {
        // Frontend and API publish independently; resume existing work while
        // the previous API is serving. Only the new API creates examples.
        if (cause instanceof ApiError && cause.status === 404) {
          const projects = await apiFetch<{ id: string }[]>('/orcapro/projects');
          if (projects[0]) return projects[0];
        }
        throw cause;
      }
    }
    open()
      .then(project => {
        if (active) window.location.replace(`/orcapro/editor?id=${encodeURIComponent(project.id)}`);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          window.location.replace('/login?next=/orcapro'); return;
        }
        setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o editor.');
      });
    return () => { active = false; };
  }, []);
  return <main className={styles.editor}><div className={styles.empty} aria-busy={!error}>
    <h1>OrçaPro</h1><p role={error ? 'alert' : 'status'}>{error || 'Abrindo seu orçamento…'}</p>
    {error ? <><Link href="/orcapro/gerenciar">Gerenciar meus orçamentos</Link><Link href="/programas">Trocar programa</Link></> : null}
  </div></main>;
}

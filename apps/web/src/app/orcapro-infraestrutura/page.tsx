'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { infraApi } from '@/lib/infra-api';
import { ORCAPRO_ONLY } from '@/lib/product-config';
import styles from '../orcapro/editor/editor.module.css';

export default function InfraEntry() {
  const [error, setError] = useState(ORCAPRO_ONLY ? 'O Infraestrutura está disponível somente no ambiente de desenvolvimento.' : '');
  useEffect(() => {
    if (ORCAPRO_ONLY) return;
    let active = true;
    infraApi<{ id: string }>('/workspace/open', { method: 'POST', body: '{}' })
      .then(project => { if (active) window.location.replace('/orcapro-infraestrutura/editor/?id=' + encodeURIComponent(project.id)); })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) { window.location.replace('/login/?next=/orcapro-infraestrutura'); return; }
        setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o orçamento.');
      });
    return () => { active = false; };
  }, []);
  return <main className={styles.editor}><div className={styles.empty} aria-busy={!error}><h1>OrçaPro Infraestrutura</h1><p role={error ? 'alert' : 'status'}>{error || 'Abrindo seu orçamento SICRO…'}</p>{error ? <><Link href="/orcapro-infraestrutura/gerenciar">Meus orçamentos</Link><Link href="/programas">Trocar programa</Link></> : null}</div></main>;
}

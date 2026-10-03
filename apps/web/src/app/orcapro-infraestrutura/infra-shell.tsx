'use client';
import Link from 'next/link';
import { Route, FolderOpen, Shield, ArrowLeftRight } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from '../orcapro/workspace.module.css';
import infraStyles from './infra.module.css';

export default function InfraShell({ title, admin, children }: { title: string; admin?: boolean; children: ReactNode }) {
  return <main className={styles.workspace + ' ' + infraStyles.responsive}>
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/orcapro-infraestrutura"><span><Route size={24} /></span><strong>OrçaPro<small>Infraestrutura · SICRO</small></strong></Link>
      <nav><Link className={styles.linkbutton} href="/orcapro-infraestrutura/gerenciar"><FolderOpen size={17} /> Meus orçamentos</Link>{admin ? <Link className={styles.linkbutton} href="/orcapro-infraestrutura/administracao"><Shield size={17} /> Administração</Link> : null}</nav>
      <footer><span className={styles.badge}>Projetos privados · catálogo global</span><Link href="/orcapro-infraestrutura">Voltar ao editor</Link><Link href="/programas"><ArrowLeftRight size={16} /> Trocar programa</Link></footer>
    </aside>
    <div className={styles.main}><header className={styles.topbar}><h1>{title}</h1><Link href="/programas">Gestão de Prédios / Infraestrutura</Link></header><div className={styles.content}>{children}</div></div>
  </main>;
}

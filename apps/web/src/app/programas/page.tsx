'use client';

import { ArrowRight, Building2, Calculator, Route, LogOut, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import { endSession } from '@/lib/end-session';
import { ORCAPRO_ONLY, PRODUCT_DOMAIN } from '@/lib/product-config';
import type { CurrentSession } from '@/lib/types';
import styles from './programas.module.css';

type OrcaProAccess = {
  enabled: boolean;
  userId: string;
  tenantId: string;
  role: 'ADMIN' | 'USER';
};

type Availability = { enabled: boolean; message: string; admin?: boolean };

function unavailableMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Sua conta não possui acesso ao OrçaPro.';
    if (error.status === 404) return 'O OrçaPro ainda não está disponível neste ambiente.';
    if (error.status === 503) return 'O OrçaPro ainda não está habilitado neste ambiente.';
  }
  return 'Não foi possível verificar o acesso ao OrçaPro. Tente novamente.';
}

export default function ProgramsPage() {
  const router = useRouter();
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [availability, setAvailability] = useState<Availability>({ enabled: false, message: '' });
  const [infraAvailability, setInfraAvailability] = useState<Availability>({ enabled: false, message: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPrograms() {
      let access: Availability;
      try {
        // This protected route uses apiFetch's existing refresh-and-retry behavior.
        const result = await apiFetch<OrcaProAccess>('/orcapro/access');
        access = {
          enabled: result.enabled === true,
          admin: result.enabled === true && result.role === 'ADMIN',
          message: result.enabled === true ? 'Disponível para sua conta.' : 'O OrçaPro ainda não está habilitado.',
        };
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          if (active) router.replace('/login?next=/programas');
          return;
        }
        access = { enabled: false, message: unavailableMessage(cause) };
      }

      try {
        const current = await apiFetch<CurrentSession>('/auth/me');
        let infrastructure: Availability = { enabled: false, message: 'OrçaPro Infraestrutura ainda não habilitado.' };
        if (!ORCAPRO_ONLY) {
          try {
            const result = await apiFetch<OrcaProAccess>('/infraestrutura/access');
            infrastructure = { enabled: result.enabled === true, admin: result.enabled === true && result.role === 'ADMIN', message: result.enabled === true ? 'Disponível para sua conta.' : 'Sua conta ainda não possui acesso ao OrçaPro Infraestrutura.' };
          } catch (cause) {
            infrastructure.message = cause instanceof ApiError && cause.status === 403 ? 'Sua conta ainda não possui acesso ao OrçaPro Infraestrutura.' : 'OrçaPro Infraestrutura indisponível neste ambiente. Os demais programas continuam acessíveis.';
          }
        }
        if (active) {
          setSession(current);
          setAvailability(access);
          setInfraAvailability(infrastructure);
          setError('');
          setLoading(false);
        }
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          router.replace('/login?next=/programas');
          return;
        }
        setError('Não foi possível validar sua sessão. Verifique a conexão e tente novamente.');
        setLoading(false);
      }
    }

    void loadPrograms();
    return () => { active = false; };
  }, [attempt, router]);

  function retry() {
    setLoading(true);
    setError('');
    setAttempt((value) => value + 1);
  }

  async function logout() {
    setSigningOut(true);
    try {
      await endSession('/login?next=/programas');
    } catch {
      setError('Não foi possível encerrar sua sessão. Tente novamente.');
      setSigningOut(false);
    }
  }

  if (loading) return <LoadingPanel label="Validando sua sessão e os programas disponíveis…" />;

  if (!session) {
    return (
      <main className="simple-auth-page">
        <section className="auth-card">
          <h1>Acesso aos programas</h1>
          <p className="notice error" role="alert">{error}</p>
          <button className="btn btn-primary" type="button" onClick={retry}>
            <RefreshCw size={16} /> Tentar novamente
          </button>
          <Link className="auth-link" href="/login?next=/programas">Voltar ao login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{PRODUCT_DOMAIN}</span>
            <h1>{ORCAPRO_ONLY ? 'Acessar OrçaPro' : 'Escolha seu programa'}</h1>
            <p>{session.user.name} · {session.tenant.name}</p>
          </div>
          <button className="btn btn-ghost" type="button" disabled={signingOut} onClick={() => void logout()}>
            <LogOut size={16} /> {signingOut ? 'Saindo…' : 'Sair da conta'}
          </button>
        </header>

        {error ? <p className="notice error" role="alert">{error}</p> : null}

        <section className={styles.programs} aria-label="Programas da sua organização">
          {!ORCAPRO_ONLY ? <article className={styles.card}>
            <span className={styles.icon}><Building2 size={28} /></span>
            <h2>Gestão de Prédios</h2>
            <p>Organize ordens de serviço, edificações, contratos e a execução da manutenção predial.</p>
            <span className={styles.status}>{session.maintenanceAccess === false ? 'Acesso à manutenção não contratado.' : 'Disponível para sua organização.'}</span>
            {session.maintenanceAccess !== false ? <Link className="btn btn-primary" href="/dashboard">
              Acessar Gestão de Prédios <ArrowRight size={16} />
            </Link> : <button className="btn btn-secondary" disabled>Acesso não contratado</button>}
          </article> : null}

          <article className={styles.card}>
            <span className={`${styles.icon} ${styles.orcaIcon}`}><Calculator size={28} /></span>
            <h2>OrçaPro</h2>
            <p>Prepare orçamentos de obras com o catálogo SINAPI e a referência de cada projeto.</p>
            <span className={styles.status} role="status">{availability.message}</span>
            {availability.enabled ? (
              <Link className="btn btn-primary" href="/orcapro">
                Acessar OrçaPro <ArrowRight size={16} />
              </Link>
            ) : (
              <div className={styles.unavailable}>
                <button className="btn btn-secondary" type="button" disabled>OrçaPro indisponível</button>
                <button className="btn btn-ghost" type="button" onClick={retry}>
                  <RefreshCw size={15} /> Verificar novamente
                </button>
                <Link href="/orcapro/assinatura">Consultar minha assinatura</Link>
              </div>
            )}
            {availability.admin ? <Link className="btn btn-secondary" href="/orcapro/administracao">Gestão do SaaS</Link> : null}
          </article>
          {!ORCAPRO_ONLY ? <article className={styles.card}>
            <span className={styles.icon}><Route size={28} /></span>
            <h2>OrçaPro Infraestrutura</h2>
            <p>Orçamentos e planejamento com SICRO, DMT, FIT, FIC, administração local, canteiro, mobilização e riscos.</p>
            <span className={styles.status}>{infraAvailability.message}</span>
            {infraAvailability.enabled ? <Link className="btn btn-primary" href="/orcapro-infraestrutura">Acessar OrçaPro Infraestrutura <ArrowRight size={16} /></Link> : <button className="btn btn-primary" type="button" disabled>Indisponível para esta conta</button>}
            {infraAvailability.admin ? <Link className="auth-link" href="/orcapro-infraestrutura/administracao">Administração do Infraestrutura</Link> : null}
          </article> : null}
        </section>

        <p className={styles.footer}>{ORCAPRO_ONLY ? 'Sair encerra sua sessão e retorna ao site do OrçaPro.' : 'A troca de programa mantém sua conta e sua organização. Sair encerra a sessão compartilhada.'}</p>
      </div>
    </main>
  );
}

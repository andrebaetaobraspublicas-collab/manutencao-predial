'use client';

import { ArrowRight, Building2, LogOut, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingPanel } from '@/components/loading';
import { ContractManagementLink } from '@/components/contract-management-link';
import { apiFetch, ApiError } from '@/lib/api';
import { endSession } from '@/lib/end-session';
import { ORCAPRO_ONLY, PRODUCT_DOMAIN } from '@/lib/product-config';
import { productionProgram, productionPrograms, type ProductionProgram } from '@/lib/program-navigation';
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
  const [production, setProduction] = useState<ProductionProgram | null>(null);
  const [domain, setDomain] = useState(PRODUCT_DOMAIN);

  useEffect(() => {
    let active = true;

    async function loadPrograms() {
      const currentProduct = productionProgram(window.location.hostname);
      if (active) { setProduction(currentProduct); setDomain(window.location.hostname); }
      if (currentProduct) {
        try {
          // Consult only the API of the current product. Other subscriptions are
          // checked by their own login flow, without sharing cross-domain tokens.
          const localAccess = await apiFetch<OrcaProAccess>(currentProduct === 'GESTAO' ? '/contract-management/access' : currentProduct === 'INFRA' ? '/infraestrutura/access' : '/orcapro/access').catch(cause => {
            if (!(cause instanceof ApiError) || cause.status !== 403) throw cause;
            return null;
          });
          const current = await apiFetch<CurrentSession>('/auth/me');
          if (active) { setSession(current); setAvailability({enabled: !!localAccess?.enabled, admin: localAccess?.role === 'ADMIN', message: ''}); setError(''); setLoading(false); }
        } catch (cause) {
          if (!active) return;
          if (cause instanceof ApiError && cause.status === 401) { router.replace('/login?next=/programas'); return; }
          setError('Não foi possível validar sua sessão. Verifique a conexão e tente novamente.');
          setLoading(false);
        }
        return;
      }
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
    <main className={`${styles.page}${production ? ` ${styles.production}` : ''}`}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{domain}</span>
            <h1>{!production && ORCAPRO_ONLY ? 'Acessar OrçaPro' : 'Escolha seu programa'}</h1>
            <p>{session.user.name} · {session.tenant.name}</p>
          </div>
          <button className="btn btn-ghost" type="button" disabled={signingOut} onClick={() => void logout()}>
            <LogOut size={16} /> {signingOut ? 'Saindo…' : 'Sair da conta'}
          </button>
        </header>

        {error ? <p className="notice error" role="alert">{error}</p> : null}

        <section className={styles.programs} aria-label="Programas da sua organização">
          {production ? productionPrograms.map(program => <article key={program.id} className={styles.card}>
            <Image src="/orcapro-brand/logo.png" alt={program.title} width={180} height={39} className={styles.appLogo} />
            <h2>{program.title}</h2>
            <p>{program.description}</p>
            <span className={styles.status}>{program.id === 'GESTAO' ? 'Assinatura adicional, exclusiva para assinantes ativos do OrçaPro ou do Infra.' : program.id === production ? 'Programa desta sessão. O acesso segue sua assinatura.' : 'Entre com sua conta e confira sua assinatura neste programa.'}</span>
            <a className="btn btn-primary" href={program.href}>Acessar {program.title} <ArrowRight size={16} /></a>
            {program.id === production && availability.admin && program.id !== 'GESTAO' && <a className="auth-link" href={program.id === 'INFRA' ? '/orcapro-infraestrutura/administracao/' : '/orcapro/administracao/'}>{program.id === 'INFRA' ? 'Administração do Infraestrutura' : 'Gestão do SaaS'}</a>}
          </article>) : <>
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
            <Image src="/orcapro-brand/logo.png" alt="OrçaPro" width={180} height={39} className={styles.appLogo} />
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
            <Image src="/orcapro-brand/logo.png" alt="OrçaPro Infraestrutura" width={180} height={39} className={styles.appLogo} />
            <h2>OrçaPro Infraestrutura</h2>
            <p>Orçamentos e planejamento com SICRO, DMT, FIT, FIC, administração local, canteiro, mobilização e riscos.</p>
            <span className={styles.status}>{infraAvailability.message}</span>
            {infraAvailability.enabled ? <Link className="btn btn-primary" href="/orcapro-infraestrutura">Acessar OrçaPro Infraestrutura <ArrowRight size={16} /></Link> : <button className="btn btn-primary" type="button" disabled>Indisponível para esta conta</button>}
            {infraAvailability.admin ? <Link className="auth-link" href="/orcapro-infraestrutura/administracao">Administração do Infraestrutura</Link> : null}
          </article> : null}
          <ContractManagementLink cardClassName={styles.card} logoClassName={styles.appLogo} statusClassName={styles.status} />
          </>}
        </section>
        <p className={styles.footer}>{production ? 'Cada programa tem seu próprio ambiente e sua própria sessão. Se solicitado, entre novamente com sua conta. Sair encerra a sessão deste programa.' : ORCAPRO_ONLY ? 'Sair encerra sua sessão e retorna ao site do OrçaPro.' : 'A troca de programa mantém sua conta e sua organização. Sair encerra a sessão compartilhada.'}</p>
      </div>
    </main>
  );
}

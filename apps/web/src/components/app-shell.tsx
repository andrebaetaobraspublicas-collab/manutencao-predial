'use client';

import {
  BarChart3,
  BadgeCheck,
  BookOpenText,
  Calculator,
  Bell,
  Building2,
  ClipboardCheck,
  FileBarChart,
  FileText,
  Gauge,
  HandCoins,
  LogOut,
  Menu,
  PackageSearch,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  SwitchCamera,
  UserRound,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { endSession } from '@/lib/end-session';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { CurrentSession } from '@/lib/types';
import { LoadingPanel } from './loading';
import { NotificationBell } from './notification-bell';

const NAVIGATION = [
  {
    label: 'Operação',
    items: [
      { href: '/dashboard', label: 'Visão gerencial', icon: Gauge },
      { href: '/ordens-servico', label: 'Ordens de serviço', icon: Wrench },
      { href: '/edificacoes', label: 'Edificações', icon: Building2 },
    ],
  },
  {
    label: 'Contratos',
    items: [
      { href: '/contratos', label: 'Contratos', icon: FileText },
      { href: '/fiscais', label: 'Fiscais', icon: ShieldCheck },
      { href: '/fornecedores', label: 'Fornecedores', icon: UsersRound },
      { href: '/medicoes', label: 'Medições', icon: ClipboardCheck },
      { href: '/empenhos', label: 'Empenhos', icon: HandCoins },
      { href: '/orcamentos', label: 'Orçamentos e SINAPI', icon: Calculator },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/planos-manutencao', label: 'Planos de manutenção', icon: PackageSearch },
      { href: '/indicadores', label: 'KPIs e SLAs', icon: BarChart3 },
      { href: '/piloto', label: 'Piloto e homologação', icon: BadgeCheck, reportsOnly: true },
      { href: '/relatorios', label: 'Relatórios', icon: FileBarChart, reportsOnly: true },
      { href: '/notificacoes', label: 'Notificações', icon: Bell },
      { href: '/configuracoes-operacionais', label: 'Configuração operacional', icon: SlidersHorizontal, managerOnly: true },
      { href: '/administracao', label: 'Administração', icon: Settings, adminOnly: true },
      { href: '/conta', label: 'Minha conta', icon: UserRound },
    ],
  },
  {
    label: 'Ajuda',
    items: [
      { href: '/manual', label: 'Manual do Usuário', icon: BookOpenText },
    ],
  },
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<CurrentSession>('/auth/me')
      .then((data) => {
        if (active) setSession(data);
      })
      .catch((error: unknown) => {
        if (active && error instanceof ApiError && error.status === 401) {
          router.replace('/login');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const pageName = useMemo(() => {
    for (const section of NAVIGATION) {
      const item = section.items.find(
        (candidate) => pathname === candidate.href || pathname.startsWith(`${candidate.href}/`),
      );
      if (item) return item.label;
    }
    return 'Gestão de Prédios';
  }, [pathname]);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true); setLogoutError('');
    try { await endSession(); }
    catch { setLogoutError('Não foi possível encerrar a sessão. Tente novamente.'); setSigningOut(false); }
  }

  if (loading) return <LoadingPanel label="Validando sua sessão…" />;
  if (!session) return null;

  return (
    <div className="app-shell">
      <div
        className={`mobile-overlay ${sidebarOpen ? 'open' : ''}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Building2 size={23} /></div>
          <div>
            <strong>Gestão de Prédios</strong>
            <small>Manutenção e contratos</small>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {NAVIGATION.map((section) => (
            <div key={section.label}>
              <div className="nav-section-title">{section.label}</div>
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                if ('adminOnly' in item && item.adminOnly && !['OWNER', 'ADMIN'].includes(session.role)) {
                  return null;
                }
                if ('managerOnly' in item && item.managerOnly && !['OWNER', 'ADMIN', 'MANAGER'].includes(session.role)) {
                  return null;
                }
                if (
                  'reportsOnly' in item &&
                  item.reportsOnly &&
                  ![
                    'OWNER',
                    'ADMIN',
                    'MANAGER',
                    'CONTRACT_MANAGER',
                    'CONTRACT_INSPECTOR',
                    'AUDITOR',
                  ].includes(session.role)
                ) {
                  return null;
                }
                return (
                  <Link
                    className={`nav-link ${active ? 'active' : ''}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon size={18} /> {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">{initials(session.user.name)}</div>
            <div>
              <strong>{session.user.name}</strong>
              <small>{session.tenant.name}</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-context">
            <button
              className="icon-button menu-button"
              type="button"
              aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setSidebarOpen((value) => !value)}
            >
              {sidebarOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div>
              <h2>{pageName}</h2>
              <p>{session.tenant.name} · perfil {session.role.toLowerCase().replaceAll('_', ' ')}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <Link className="btn btn-ghost" href="/programas" aria-label="Trocar programa">
              <SwitchCamera size={16} /> <span className="topbar-label">Trocar programa</span>
            </Link>
            <NotificationBell />
            <span className="badge success topbar-label"><ShieldCheck size={13} /> sessão protegida</span>
            <button className="btn btn-ghost" type="button" disabled={signingOut} onClick={logout}>
              <LogOut size={16} /> <span className="topbar-label">{signingOut ? 'Saindo…' : 'Sair'}</span>
            </button>
          </div>
        </header>
        <main>{logoutError ? <p className="notice error" role="alert">{logoutError}</p> : null}{children}</main>
      </div>
    </div>
  );
}

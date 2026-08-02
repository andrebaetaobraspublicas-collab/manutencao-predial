'use client';

import { KeyRound, MailPlus, RefreshCw, ShieldOff, UserCheck, Users } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import type { CurrentSession, Member, TenantInvitation } from '@/lib/types';

const ROLES = [
  'ADMIN',
  'MANAGER',
  'CONTRACT_MANAGER',
  'CONTRACT_INSPECTOR',
  'OPERATOR',
  'REQUESTER',
  'AUDITOR',
];

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário', ADMIN: 'Administrador', MANAGER: 'Gestor',
  CONTRACT_MANAGER: 'Gestor de contratos', CONTRACT_INSPECTOR: 'Fiscal de contrato',
  OPERATOR: 'Operador', REQUESTER: 'Demandante', AUDITOR: 'Auditor',
};

export default function AdministrationPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      const [memberData, invitationData, sessionData] = await Promise.all([
        apiFetch<Member[]>('/members'),
        apiFetch<TenantInvitation[]>('/members/invitations'),
        apiFetch<CurrentSession>('/auth/me'),
      ]);
      setMembers(memberData);
      setInvitations(invitationData);
      setSession(sessionData);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The initial request intentionally hydrates this client-only administration view.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await apiFetch('/members/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email,
          role,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      setEmail(''); setExpiresAt('');
      setSuccess('Convite enviado. O link é válido por 72 horas.');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível enviar o convite.');
    } finally { setSubmitting(false); }
  }

  async function updateMember(member: Member, data: Record<string, string>) {
    setError(''); setSuccess('');
    try {
      await apiFetch(`/members/${member.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      setSuccess('Acesso atualizado e sessões anteriores revogadas.');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar o acesso.');
    }
  }

  async function revoke(member: Member) {
    setError(''); setSuccess('');
    try {
      await apiFetch(`/members/${member.id}/revoke-sessions`, { method: 'POST' });
      setSuccess(`Sessões de ${member.user.name} revogadas.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível revogar as sessões.');
    }
  }

  if (loading) return <LoadingPanel label="Carregando usuários…" />;

  return <div className="page-container">
    <header className="page-header"><div className="page-title"><h1>Administração</h1><p>Convites, papéis, acessos provisórios e controle de sessões da organização.</p></div></header>
    {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}
    {success ? <div className="notice" style={{ marginBottom: 18 }}>{success}</div> : null}

    <form className="card form-card" onSubmit={invite} style={{ marginBottom: 18 }}>
      <section className="form-section">
        <div className="form-section-header"><h2>Convidar usuário</h2><p>O destinatário receberá um link de uso único para ativar o acesso.</p></div>
        <div className="form-grid">
          <div className="field col-4"><label htmlFor="inviteEmail">E-mail</label><input id="inviteEmail" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field col-4"><label htmlFor="inviteRole">Perfil</label><select id="inviteRole" className="select" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.filter((item) => session?.role === 'OWNER' || item !== 'ADMIN').map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></div>
          <div className="field col-4"><label htmlFor="inviteExpiry">Fim do acesso provisório</label><input id="inviteExpiry" className="input" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /><small>Deixe em branco para acesso sem expiração.</small></div>
        </div>
      </section>
      <div className="form-footer"><button className="btn btn-primary" type="submit" disabled={submitting}><MailPlus size={16} /> {submitting ? 'Enviando…' : 'Enviar convite'}</button></div>
    </form>

    <section className="card table-card" style={{ marginBottom: 18 }}>
      {members.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Validade</th><th>Sessões</th><th>Ações</th></tr></thead><tbody>{members.map((member) => {
        const protectedMember = member.role === 'OWNER' || member.user.id === session?.user.id || (session?.role === 'ADMIN' && member.role === 'ADMIN');
        const inactive = ['SUSPENDED', 'EXPIRED'].includes(member.effectiveStatus);
        return <tr key={member.id}><td><span className="table-primary">{member.user.name}</span><span className="table-secondary">{member.user.email} · {member.user.emailVerifiedAt ? 'e-mail verificado' : 'e-mail pendente'}</span></td><td>{protectedMember ? <span className="badge neutral">{ROLE_LABELS[member.role]}</span> : <select className="select compact-control" aria-label={`Perfil de ${member.user.name}`} value={member.role} onChange={(e) => void updateMember(member, { role: e.target.value })}>{ROLES.filter((item) => session?.role === 'OWNER' || item !== 'ADMIN').map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select>}</td><td><span className={`badge status-${member.effectiveStatus}`}>{member.effectiveStatus.toLowerCase()}</span></td><td>{member.expiresAt ? new Date(member.expiresAt).toLocaleString('pt-BR') : 'Sem expiração'}</td><td>{member.activeSessions}</td><td><div className="table-actions">{!protectedMember ? <button className="btn btn-ghost" type="button" onClick={() => void updateMember(member, { status: inactive ? 'ACTIVE' : 'SUSPENDED' })}>{inactive ? <UserCheck size={15} /> : <ShieldOff size={15} />}{inactive ? 'Reativar' : 'Suspender'}</button> : null}{!protectedMember && member.activeSessions > 0 ? <button className="btn btn-ghost" type="button" onClick={() => void revoke(member)}><RefreshCw size={15} /> Revogar sessões</button> : null}</div></td></tr>;
      })}</tbody></table></div> : <EmptyState icon={Users} title="Nenhum usuário cadastrado" description="Envie o primeiro convite para formar sua equipe." />}
    </section>

    <section className="card table-card">
      <div className="card-header"><div><h2>Histórico de convites</h2><p>Convites enviados, aceitos, expirados ou revogados.</p></div><KeyRound size={19} /></div>
      <div className="table-wrapper"><table className="data-table"><thead><tr><th>Destinatário</th><th>Perfil</th><th>Enviado por</th><th>Expira em</th><th>Situação</th></tr></thead><tbody>{invitations.map((invite) => { const status = invite.acceptedAt ? 'Aceito' : invite.revokedAt ? 'Revogado' : new Date(invite.expiresAt) <= new Date() ? 'Expirado' : 'Pendente'; return <tr key={invite.id}><td>{invite.email}</td><td>{ROLE_LABELS[invite.membership.role]}</td><td>{invite.invitedBy.name}</td><td>{new Date(invite.expiresAt).toLocaleString('pt-BR')}</td><td><span className="badge neutral">{status}</span></td></tr>; })}</tbody></table></div>
    </section>
  </div>;
}

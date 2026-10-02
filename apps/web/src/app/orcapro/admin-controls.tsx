'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './workspace.module.css';

type User = { id: string; name: string; email: string; maintenanceStatus: string; orcaproEnabled: boolean; orcaproRole: string };
type Log = { id: string; action: string; actorUserId: string; entityId: string; createdAt: string };
type Logs = { items: Log[]; total: number; page: number; pageSize: number };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.';
const labels: Record<string, string> = { 'sinapi.import': 'Importação SINAPI', 'sinapi.validate': 'Validação de referência', 'sinapi.publish': 'Publicação de referência', 'sinapi.archive': 'Arquivamento de referência', 'sinapi.default.change': 'Alteração da referência padrão', 'project.create': 'Criação de orçamento', 'project.save': 'Salvamento de orçamento', 'project.archive': 'Arquivamento de orçamento', 'project.unarchive': 'Recuperação de orçamento', 'composition.adapt': 'Cópia própria de SINAPI', 'custom.revise': 'Revisão de cadastro próprio', 'template.update': 'Alteração de exemplo', 'user.orcapro-access.change': 'Alteração de acesso ao OrçaPro', 'access.update': 'Alteração de acesso ao OrçaPro' };

export function AdminControls({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [logs, setLogs] = useState<Logs | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<{ items: User[]; total: number }>(`/orcapro/admin/users?page=${usersPage}&pageSize=30`), apiFetch<Logs>(`/orcapro/admin/logs?page=${page}&pageSize=30`)]).then(([people, history]) => { if (active) { setUsers(people.items); setUsersTotal(people.total); setLogs(history); } }).catch(cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [page, usersPage]);
  async function changeAccess(user: User) {
    setBusy(user.id); setError('');
    try {
      await apiFetch(`/orcapro/admin/users/${user.id}/access`, { method: 'PATCH', body: JSON.stringify({ enabled: !user.orcaproEnabled }) });
      const people = await apiFetch<{ items: User[]; total: number }>(`/orcapro/admin/users?page=${usersPage}&pageSize=30`); setUsers(people.items); setUsersTotal(people.total);
      setLogs(await apiFetch<Logs>(`/orcapro/admin/logs?page=${page}&pageSize=30`));
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(''); }
  }
  return <>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <section className={styles.panel}><h2>Usuários do OrçaPro</h2><p className={styles.muted}>Ative ou desative o acesso a este programa. A conta e as permissões do Gestão de Prédios são preservadas.</p><div className={styles.tablewrap}><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel OrçaPro</th><th>Acesso OrçaPro</th><th /></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.orcaproRole}</td><td>{user.orcaproEnabled ? 'Ativo' : 'Desativado'}</td><td><button disabled={!!busy || user.id === currentUserId} onClick={() => changeAccess(user)}>{busy === user.id ? 'Salvando…' : user.orcaproEnabled ? 'Desativar acesso' : 'Ativar acesso'}</button></td></tr>)}</tbody></table></div><div className={styles.pager}><button disabled={usersPage === 1} onClick={() => setUsersPage(p => p - 1)}>Anterior</button><span>Página {usersPage}</span><button disabled={usersPage * 30 >= usersTotal} onClick={() => setUsersPage(p => p + 1)}>Próxima</button></div></section>
    <section className={styles.panel}><h2>Registro de auditoria</h2><div className={styles.tablewrap}><table><thead><tr><th>Quando</th><th>Operação</th><th>Responsável</th></tr></thead><tbody>{logs?.items.map(log => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString('pt-BR')}</td><td>{labels[log.action] ?? log.action}</td><td>{users.find(user => user.id === log.actorUserId)?.name ?? 'Conta não disponível na lista'}</td></tr>)}</tbody></table></div><div className={styles.pager}><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page}</span><button disabled={!logs || page * 30 >= logs.total} onClick={() => setPage(p => p + 1)}>Próxima</button></div></section>
  </>;
}

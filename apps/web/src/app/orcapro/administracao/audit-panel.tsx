'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { infraApi } from '@/lib/infra-api';
import styles from '../workspace.module.css';
import css from './audit.module.css';

type Event = { id: string; createdAt: string; action: string; entityId: string; entityName: string | null; actorUserId: string; actor: { name: string; email: string } | null; metadata: Record<string, unknown> | null };
type History = { items: Event[]; total: number; page: number; pages: number; pageSize: number };
const initial = { user: '', from: '', to: '', category: 'all', pageSize: '50' };
const actions: Record<string, string> = {
  'activity.navigation': 'Tela aberta',
  'access.login': 'Entrada no sistema', 'access.login.failed': 'Tentativa de entrada recusada', 'access.logout': 'Saída do sistema', 'access.request': 'Acesso / operação na API', 'access.request.failed': 'Operação com falha',
  'project.create': 'Orçamento criado', 'project.save': 'Orçamento salvo', 'project.archive': 'Orçamento arquivado', 'project.unarchive': 'Orçamento restaurado', 'project.restore': 'Versão do orçamento restaurada',
  'project.input-prices.update': 'Preço de insumo alterado no orçamento', 'project.duplicate': 'Orçamento duplicado', 'project.migration.comparison': 'Comparação de referência SICRO', 'project.migrate': 'Referência do orçamento atualizada',
  'own.save': 'Cadastro próprio salvo', 'own.archive': 'Cadastro próprio arquivado', 'cycle.create': 'Referência SICRO criada', 'cycle.finalize': 'Referência SICRO conferida', 'cycle.publish': 'Referência SICRO publicada', 'cycle.archive': 'Referência SICRO arquivada',
  'user.create': 'Usuário cadastrado', 'user.grant': 'Acesso ao Infraestrutura concedido / alterado', 'user.archive': 'Acesso ao Infraestrutura encerrado', 'user.password': 'Senha alterada', 'user.password.request': 'Alteração de senha solicitada', 'user.password.failed': 'Falha ao alterar senha', 'admin.project.read': 'Orçamento consultado pelo administrador', 'policy.update': 'Política ou termos atualizados', 'lgpd.export': 'Exportação de dados solicitada', 'lgpd.export.complete': 'Exportação de dados concluída', 'lgpd.deletion.request': 'Exclusão de dados solicitada',
  'custom.revise': 'Cadastro próprio revisado', 'composition.adapt': 'Cópia de composição criada', 'template.update': 'Exemplo atualizado',
  'sinapi.import': 'Referência SINAPI importada', 'sinapi.validate': 'Referência conferida', 'sinapi.publish': 'Referência publicada', 'sinapi.default.change': 'Referência padrão alterada', 'sinapi.archive': 'Referência arquivada',
  'saas.user.create': 'Usuário cadastrado', 'saas.user.password': 'Senha alterada', 'saas.user.status': 'Acesso alterado', 'saas.user.revoke': 'Sessões revogadas', 'user.orcapro-access.change': 'Permissão OrçaPro alterada',
  'saas.plan.save': 'Plano salvo', 'saas.subscription.manual': 'Assinatura gerenciada manualmente', 'saas.subscription.stripe': 'Assinatura gerenciada no Stripe', 'saas.subscription.webhook': 'Assinatura atualizada pelo Stripe', 'saas.user.self-register': 'Conta criada na assinatura',
};
const fields: Record<string, string> = { screen: 'Tela', method: 'Método', route: 'Operação / rota', status: 'Resultado / situação', durationMs: 'Duração (ms)', ip: 'IP observado pela API', browser: 'Navegador', reason: 'Motivo', version: 'Versão', referenceId: 'Referência', uf: 'UF', regime: 'Regime', details: 'Detalhes', enabled: 'Acesso liberado', type: 'Tipo', sourceCode: 'Código de origem' };
const format = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
function operation(event: Event) {
  const route = String(event.metadata?.route ?? '');
  if (!event.action.startsWith('access.request')) return '';
  if (route.includes('catalog/inputs')) return 'Consulta de insumos';
  if (route.includes('catalog/compositions')) return 'Consulta de composições';
  if (route.includes('catalog/navigation')) return 'Navegação no catálogo';
  if (route.includes('cycles') && route.includes('compositions')) return 'Consulta de composições SICRO';
  if (route.includes('cycles') && route.includes('inputs')) return 'Consulta de insumos SICRO';
  if (route.includes('snapshot') || route.includes('pem')) return 'Carregamento de referência SICRO / produções';
  if (route.includes('catalog/bundle')) return 'Carregamento de analíticos';
  if (route.includes('export')) return 'Exportação de orçamento';
  if (route.includes('risk')) return 'Riscos e contingências';
  if (route.includes('projects/:id')) return 'Acesso ao orçamento';
  if (route.includes('admin')) return 'Administração do SaaS / referências';
  return route;
}
const screens: Record<string, string> = { catalog: 'Catálogo', inputs: 'Insumos', comps: 'Composições', compositions: 'Composições', budget: 'Orçamento', bdi: 'BDI', teams: 'Equipes e produtividade', crews: 'Equipes e produtividade', schedule: 'Cronograma', resources: 'Recursos e Curva S', tax: 'Reforma Tributária', reforma: 'Reforma Tributária', risks: 'Riscos e contingências', manual: 'Manual', projects: 'Meus orçamentos', admin: 'Base de dados', base: 'Base de dados', videos: 'Vídeo-aulas', transports: 'Transportes (DMT)', fit: 'FIT', fic: 'FIC', pem: 'Produções Horárias', mobilization: 'Mobilização', canteiro: 'Canteiro de Obras', al: 'Administração Local', evento: 'Eventograma' };

export default function AuditPanel({ product = 'orcapro', title }: { product?: 'orcapro' | 'infra'; title?: string } = {}) {
  const [draft, setDraft] = useState(initial), [filter, setFilter] = useState(initial);
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [history, setHistory] = useState<History | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(Object.entries({ ...filter, page: String(page) }).filter(([, value]) => value.trim() !== ''));
    Promise.resolve().then(() => { if (active) { setLoading(true); setError(''); } return product === 'infra' ? infraApi<History>(`/admin/audit?${query}`) : apiFetch<History>(`/orcapro/admin/logs?${query}`); })
      .then(value => { if (active) setHistory(value); }).catch(cause => { if (active) { setHistory(null); setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a auditoria.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, page, refresh, product]);
  function apply(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) { setError('A data inicial deve preceder a data final.'); return; }
    setPage(1); setFilter({ ...draft }); setRefresh(v => v + 1);
  }
  const displayedPage = history?.page ?? page;
  return <section className={styles.panel} aria-busy={loading}>
    <h2>{title ?? `Auditoria do ${product === 'infra' ? 'OrçaPro Infraestrutura' : 'OrçaPro'}`}</h2>
    <p className={styles.muted}>Consulte todo o histórico disponível. Datas e horários de Brasília (America/Sao_Paulo); a data final inclui o dia inteiro.</p>
    <form className={css.filters} onSubmit={apply}>
      <label>Usuário<input placeholder="Nome ou e-mail do responsável" maxLength={150} value={draft.user} onChange={e => setDraft({ ...draft, user: e.target.value })} /></label>
      <label>Data inicial<input type="date" value={draft.from} onInput={e => { const from = e.currentTarget.value; setDraft(current => ({ ...current, from })); }} /></label>
      <label>Data final<input type="date" value={draft.to} onInput={e => { const to = e.currentTarget.value; setDraft(current => ({ ...current, to })); }} /></label>
      <label>Tipo de registro<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}><option value="all">Todos</option><option value="access">Acessos e operações</option><option value="activity">Alterações e atividades</option><option value="failure">Falhas registradas</option></select></label>
      <label>Por página<select value={draft.pageSize} onChange={e => setDraft({ ...draft, pageSize: e.target.value })}>{[20, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label>
      <button disabled={loading}>Aplicar filtros</button><button type="button" disabled={loading} onClick={() => { setDraft(initial); setFilter(initial); setPage(1); setRefresh(v => v + 1); }}>Limpar filtros</button>
      <button type="button" disabled={loading} onClick={() => setRefresh(v => v + 1)}>Atualizar registros</button>
    </form>
    <p className={styles.muted}>Os registros antigos foram preservados. A nova captura de acessos começa com esta atualização; atividades que não eram registradas não aparecem retroativamente. Consultar esta auditoria não gera novos eventos na lista.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <p role="status">{loading ? 'Consultando histórico…' : `${history?.total ?? 0} registros encontrados`}</p>
    {!loading && history ? <>
      <div className={styles.tablewrap}><table><thead><tr><th>Quando</th><th>Responsável</th><th>Atividade</th><th>Registro / orçamento</th><th>Detalhes</th></tr></thead><tbody>{history.items.map(event => <tr key={event.id}>
        <td className={css.when}>{format(event.createdAt)}</td>
        <td>{event.actor?.name ?? (event.actorUserId === '00000000-0000-0000-0000-000000000000' ? 'Não autenticado' : 'Conta não disponível / sistema')}<small className={css.secondary}>{event.actor?.email ?? event.actorUserId}</small></td>
        <td>{actions[event.action] ?? event.action}<small className={css.secondary}>{event.action === 'activity.navigation' ? screens[String(event.metadata?.screen)] ?? String(event.metadata?.screen ?? '') : operation(event)}</small>{String(event.metadata?.status ?? '').match(/^[45]\d\d$/) ? <strong className={css.failure}>Falha · HTTP {String(event.metadata?.status)}</strong> : null}</td>
        <td>{event.entityName}<small className={css.secondary}>{event.entityId}</small></td>
        <td><details><summary>Ver detalhes</summary><dl className={css.details}><dt>Identificador do evento</dt><dd>{event.id}</dd><dt>Ação técnica</dt><dd>{event.action}</dd>{Object.entries(event.metadata ?? {}).map(([key, value]) => <div key={key}><dt>{fields[key] ?? key}</dt><dd>{typeof value === 'object' ? <pre>{JSON.stringify(value, null, 2)}</pre> : String(value ?? '—')}</dd></div>)}</dl></details></td>
      </tr>)}</tbody></table></div>
      {!history.items.length ? <p>Nenhum registro para estes filtros. Amplie o período ou limpe o usuário.</p> : null}
      <div className={styles.pager}><button disabled={displayedPage <= 1} onClick={() => setPage(1)}>Primeira</button><button disabled={displayedPage <= 1} onClick={() => setPage(displayedPage - 1)}>Anterior</button><span>Página {displayedPage} de {history.pages} · {history.total} registros</span><button disabled={displayedPage >= history.pages} onClick={() => setPage(displayedPage + 1)}>Próxima</button><button disabled={displayedPage >= history.pages} onClick={() => setPage(history.pages)}>Última</button></div>
    </> : null}
  </section>;
}

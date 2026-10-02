'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Building2, Calculator, FolderOpen, LogOut, Plus, Search, ShieldCheck } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import styles from './workspace.module.css';
import { ProjectImport, ProjectHistory, ReferenceImport } from './panels';

type Access = { enabled: boolean; role: 'ADMIN' | 'USER'; userId: string; tenantId: string };
type Reference = { id: string; label: string; year: number; month: number; revision: number; status: string };
type Project = { id: string; name: string; referenceId: string; uf: string; regime: string; version: number; updatedAt: string };
type Template = { id: string; code: string; name: string; referenceId: string };
type CatalogItem = { id?: string; code: string; description: string; unit: string; cost?: string | null; costCents?: number | string | null; price?: string | null; priceCents?: number | string | null; classification?: string; group?: string; attributedToSP?: boolean; missingPrice?: boolean };
type Analytic = CatalogItem & { items: (CatalogItem & { type: 'I' | 'C'; coefficient: string; subtotal: string | null })[]; fallbackInputs?: string[] };
type Catalog = { items: CatalogItem[]; total: number; page: number; pageSize: number };
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

function message(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.'; }
function money(item: CatalogItem) {
  const cents = item.costCents ?? item.priceCents;
  const value = cents != null ? Number(cents) / 100 : item.cost != null ? Number(item.cost) : item.price != null ? Number(item.price) : null;
  return value != null && Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) : 'Preço não disponível';
}
function unwrap<T>(response: T[] | { items: T[] }): T[] { return Array.isArray(response) ? response : response.items; }

export default function OrcaproPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'projects' | 'catalog' | 'admin'>('projects');
  const [references, setReferences] = useState<Reference[]>([]);
  const [referenceId, setReferenceId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [uf, setUf] = useState('SP');
  const [regime, setRegime] = useState('SD');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<'inputs' | 'compositions'>('compositions');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [analytic, setAnalytic] = useState<Analytic | null>(null);
  const [historyProject, setHistoryProject] = useState<Project | null>(null);
  const [adminReferences, setAdminReferences] = useState<Reference[]>([]);

  const loadProjects = useCallback(async (archived = showArchived) => {
    const rows = await apiFetch<Project[] | { items: Project[] }>(`/orcapro/projects${archived ? '?archived=true' : ''}`);
    setProjects(unwrap(rows));
  }, [showArchived]);

  useEffect(() => {
    let active = true;
    (async () => {
      const userAccess = await apiFetch<Access>('/orcapro/access');
      const refs = await apiFetch<{ items: Reference[]; defaultReferenceId: string | null }>('/orcapro/references');
      const [rows, examples] = await Promise.all([
        apiFetch<Project[] | { items: Project[] }>('/orcapro/projects'),
        apiFetch<Template[] | { items: Template[] }>('/orcapro/templates'),
      ]);
      if (!active) return;
      setAccess(userAccess); setReferences(refs.items); setReferenceId(refs.defaultReferenceId ?? refs.items[0]?.id ?? '');
      setProjects(unwrap(rows)); setTemplates(unwrap(examples));
    })().catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) { window.location.assign('/login?next=/orcapro'); return; }
      setError(cause instanceof ApiError && [403, 404, 503].includes(cause.status)
        ? 'O OrçaPro ainda não está habilitado para sua conta. O Gestão de Prédios continua disponível.' : message(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (view !== 'catalog' || !referenceId || !access) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setCatalogBusy(true); setError('');
      const params = new URLSearchParams({ referenceId, uf, regime, search, page: String(page), pageSize: '40' });
      apiFetch<Catalog>(`/orcapro/catalog/${kind}?${params}`, { signal: controller.signal })
        .then((data) => { if (active) setCatalog(data); })
        .catch((cause: unknown) => { if (active && !(cause instanceof DOMException && cause.name === 'AbortError')) setError(message(cause)); })
        .finally(() => { if (active) setCatalogBusy(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [view, referenceId, uf, regime, search, page, kind, access]);

  async function createProject(event: FormEvent) {
    event.preventDefault(); setCreating(true); setError(''); setNotice('');
    try {
      const project = await apiFetch<Project>('/orcapro/projects', { method: 'POST', body: JSON.stringify({ name: name.trim(), referenceId, uf, regime }) });
      setName(''); await loadProjects(); setNotice('Orçamento criado e vinculado à referência selecionada.');
      window.location.assign(`/orcapro/editor?id=${encodeURIComponent(project.id)}`);
    } catch (cause) { setError(message(cause)); } finally { setCreating(false); }
  }
  async function cloneExample(template: Template) {
    setCreating(true); setError('');
    try {
      const project = await apiFetch<Project>(`/orcapro/templates/${encodeURIComponent(template.id)}/clone`, { method: 'POST', body: JSON.stringify({}) });
      await loadProjects(); window.location.assign(`/orcapro/editor?id=${encodeURIComponent(project.id)}`);
    } catch (cause) { setError(message(cause)); } finally { setCreating(false); }
  }
  async function showAnalytic(item: CatalogItem) {
    setError('');
    try {
      const params = new URLSearchParams({ referenceId, uf, regime });
      setAnalytic(await apiFetch<Analytic>(`/orcapro/catalog/compositions/${encodeURIComponent(item.code)}?${params}`));
    } catch (cause) { setError(message(cause)); }
  }
  async function openAdmin() {
    setView('admin'); setError('');
    try { setAdminReferences(unwrap(await apiFetch<Reference[] | { items: Reference[] }>('/orcapro/admin/references'))); }
    catch (cause) { setError(message(cause)); }
  }
  async function setDefault(id: string) {
    setError('');
    try {
      await apiFetch('/orcapro/admin/default-reference', { method: 'PUT', body: JSON.stringify({ referenceId: id }) });
      setReferenceId(id); setNotice('Referência padrão atualizada para novos orçamentos.');
    } catch (cause) { setError(message(cause)); }
  }
  async function referenceAction(id: string, action: 'validate' | 'publish' | 'archive') {
    setError(''); setNotice('');
    try {
      await apiFetch(`/orcapro/admin/references/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' });
      await openAdmin();
      const updated = await apiFetch<{ items: Reference[]; defaultReferenceId: string | null }>('/orcapro/references');
      setReferences(updated.items); setNotice(action === 'validate' ? 'Referência validada. Confira o relatório antes de publicar.' : action === 'publish' ? 'Referência publicada. Projetos existentes conservaram sua referência.' : 'Referência arquivada; os orçamentos históricos continuam reproduzíveis.');
    } catch (cause) { setError(message(cause)); }
  }
  async function copyComposition() {
    if (!analytic) return;
    setError('');
    try {
      const copied = await apiFetch<{ code: string }>(`/orcapro/custom-compositions/from-sinapi/${encodeURIComponent(analytic.code)}`, { method: 'POST', body: JSON.stringify({ referenceId }) });
      setNotice(`Cópia própria ${copied.code} criada na sua biblioteca, com origem SINAPI ${analytic.code}.`); setAnalytic(null);
    } catch (cause) { setError(message(cause)); }
  }
  async function toggleArchived() {
    setError('');
    try { const next = !showArchived; await loadProjects(next); setShowArchived(next); }
    catch (cause) { setError(message(cause)); }
  }
  async function recoverProject(project: Project) {
    setError('');
    try {
      await apiFetch(`/orcapro/projects/${project.id}/unarchive`, { method: 'POST', body: JSON.stringify({ expectedVersion: project.version }) });
      await loadProjects(false); setShowArchived(false); setNotice('Orçamento recuperado.');
    } catch (cause) { setError(message(cause)); }
  }
  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined); window.location.assign('/login');
  }

  if (loading) return <main className={styles.loading} aria-busy="true"><Calculator size={30} /><p>Validando sessão do OrçaPro…</p></main>;
  if (!access) return <main className={styles.loading}><Calculator size={32} /><h1>OrçaPro</h1><p role="alert">{error}</p><Link href="/dashboard">Abrir Gestão de Prédios</Link><Link href="/programas">Escolher programa</Link></main>;

  return <div className={styles.workspace}>
    <aside className={styles.sidebar}>
      <Link href="/orcapro" className={styles.brand}><span><Calculator size={25} /></span><strong>OrçaPro<small>SINAPI · orçamento de obras</small></strong></Link>
      <nav aria-label="Navegação OrçaPro">
        <button className={view === 'projects' ? styles.active : ''} onClick={() => { setView('projects'); setError(''); }}><FolderOpen size={19} /> Meus orçamentos</button>
        <button className={view === 'catalog' ? styles.active : ''} onClick={() => { setView('catalog'); setError(''); }}><Search size={19} /> Catálogo SINAPI</button>
        {access.role === 'ADMIN' ? <button className={view === 'admin' ? styles.active : ''} onClick={openAdmin}><ShieldCheck size={19} /> Base de dados</button> : null}
        {access.role === 'ADMIN' ? <Link href="/orcapro/administracao"><ShieldCheck size={19} /> Gestão do SaaS</Link> : null}
        <Link href="/orcapro/assinatura">Minha assinatura</Link>
      </nav>
      <footer><span className={styles.badge}>Sessão protegida · {access.role}</span><Link href="/programas"><Building2 size={16} /> Trocar programa</Link><button onClick={logout}><LogOut size={16} /> Sair</button></footer>
    </aside>
    <main className={styles.main}>
      <header className={styles.topbar}><h1>{view === 'projects' ? 'Meus orçamentos' : view === 'catalog' ? 'Catálogo SINAPI' : 'Base de dados'}</h1><Link href="/programas">Gestão de Prédios / OrçaPro</Link></header>
      <div className={styles.content}>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {view === 'projects' ? <>
          <section className={styles.panel}><h2>Novo orçamento</h2><form onSubmit={createProject} className={styles.form}>
            <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required placeholder="Nome da obra" /></label>
            <label>Referência SINAPI<select required value={referenceId} onChange={(e) => setReferenceId(e.target.value)}><option value="" disabled>Selecione uma referência publicada</option>{references.map((r) => <option key={r.id} value={r.id}>{r.label} · revisão {r.revision}</option>)}</select></label>
            <label>UF<select value={uf} onChange={(e) => setUf(e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
            <label>Regime<select value={regime} onChange={(e) => setRegime(e.target.value)}><option value="SD">Não desonerado</option><option value="CD">Desonerado</option><option value="SE">Sem encargos</option></select></label>
            <button className={styles.primary} disabled={creating || !referenceId}><Plus size={17} /> Criar orçamento</button>
          </form>{!references.length ? <p className={styles.muted}>O administrador deve publicar uma referência SINAPI para iniciar novos orçamentos.</p> : null}</section>
          <section className={styles.panel}><header className={styles.sectionHeader}><h2>{showArchived ? 'Orçamentos arquivados' : 'Orçamentos salvos'}</h2><button onClick={toggleArchived}>{showArchived ? 'Ver ativos' : 'Ver arquivados'}</button></header>{projects.length ? <div className={styles.tablewrap}><table><thead><tr><th>Obra</th><th>Referência</th><th>UF</th><th>Regime</th><th>Versão</th><th /></tr></thead><tbody>{projects.map((p) => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{references.find((r) => r.id === p.referenceId)?.label ?? 'Referência histórica'}</td><td>{p.uf}</td><td>{p.regime}</td><td>{p.version}</td><td className={styles.actions}>{showArchived ? <button onClick={() => recoverProject(p)}>Recuperar orçamento</button> : <><Link className={styles.linkbutton} href={`/orcapro/editor?id=${encodeURIComponent(p.id)}`}>Abrir orçamento</Link><button onClick={() => setHistoryProject(p)}>Versões e exportação</button></>}</td></tr>)}</tbody></table></div> : <p className={styles.muted}>{showArchived ? 'Nenhum orçamento arquivado.' : 'Nenhum orçamento criado por você nesta organização.'}</p>}</section>
          {templates.length ? <section className={styles.panel}><h2>Exemplos</h2><div className={styles.examples}>{templates.map((t) => <div key={t.id}><Calculator size={22} /><strong>{t.name}</strong><button disabled={creating} onClick={() => cloneExample(t)}>Usar este exemplo</button></div>)}</div><p className={styles.muted}>Cada exemplo cria uma cópia privada que você pode editar.</p></section> : null}
          <ProjectImport references={references} defaultReferenceId={referenceId} onImported={loadProjects} />
        </> : null}
        {view === 'catalog' ? <section className={styles.panel}>
          <div className={styles.filters}><label>Tipo<select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setPage(1); }}><option value="compositions">Composições</option><option value="inputs">Insumos</option></select></label><label>Referência<select value={referenceId} onChange={(e) => { setReferenceId(e.target.value); setPage(1); }}>{references.map((r) => <option key={r.id} value={r.id}>{r.label} · revisão {r.revision}</option>)}</select></label><label>UF<select value={uf} onChange={(e) => { setUf(e.target.value); setPage(1); }}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label><label>Regime<select value={regime} onChange={(e) => { setRegime(e.target.value); setPage(1); }}><option value="SD">Não desonerado</option><option value="CD">Desonerado</option><option value="SE">Sem encargos</option></select></label><label className={styles.search}>Código ou descrição<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Ex.: concreto, 94964" /></label></div>
          <p className={styles.muted} role="status">{catalogBusy ? 'Consultando catálogo…' : `${catalog?.total ?? 0} registros · custos para ${uf} / ${regime}`}</p>
          <div className={styles.tablewrap} aria-busy={catalogBusy}><table><thead><tr><th>Código</th><th>Descrição</th><th>Unidade</th><th>Origem</th><th className={styles.number}>Custo unitário</th>{kind === 'compositions' ? <th /> : null}</tr></thead><tbody>{catalog?.items.map((item) => <tr key={item.code}><td className={styles.code}>{item.code}</td><td>{item.description}</td><td>{item.unit}</td><td><span className={styles.badge}>SINAPI</span></td><td className={styles.number}>{money(item)}</td>{kind === 'compositions' ? <td><button onClick={() => showAnalytic(item)}>Analítico</button></td> : null}</tr>)}</tbody></table></div>
          {!catalogBusy && !catalog?.items.length ? <p className={styles.muted}>Nenhum registro encontrado para estes filtros.</p> : null}
          <div className={styles.pager}><button disabled={page === 1 || catalogBusy} onClick={() => setPage((p) => p - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil((catalog?.total ?? 0) / 40))}</span><button disabled={page * 40 >= (catalog?.total ?? 0) || catalogBusy} onClick={() => setPage((p) => p + 1)}>Próxima</button></div>
        </section> : null}
        {view === 'admin' && access.role === 'ADMIN' ? <>
          <ReferenceImport onImported={openAdmin} />
          <section className={styles.panel}><h2>Referências SINAPI</h2><p className={styles.muted}>O padrão é usado ao criar novos projetos. Orçamentos anteriores conservam sua referência.</p><div className={styles.tablewrap}><table><thead><tr><th>Referência</th><th>Revisão</th><th>Situação</th><th /></tr></thead><tbody>{adminReferences.map((r) => <tr key={r.id}><td>{r.label}</td><td>{r.revision}</td><td>{r.status}</td><td className={styles.actions}>{r.status === 'DRAFT' ? <button onClick={() => referenceAction(r.id, 'validate')}>Validar</button> : r.status === 'VALIDATED' ? <button onClick={() => referenceAction(r.id, 'publish')}>Publicar</button> : r.status === 'PUBLISHED' ? <><button onClick={() => setDefault(r.id)}>Usar como padrão</button><button onClick={() => referenceAction(r.id, 'archive')}>Arquivar referência</button></> : null}</td></tr>)}</tbody></table></div></section>
          <section className={styles.panel}><h2>Gestão do SaaS</h2><p>Usuários, senhas, planos, assinaturas e auditoria estão na administração do sistema.</p><Link href="/orcapro/administracao">Abrir gestão do SaaS</Link></section>
        </> : null}
      </div>
    </main>
    {analytic ? <div className={styles.overlay} onClick={() => setAnalytic(null)}><section className={styles.drawer} role="dialog" aria-modal="true" aria-label="Analítico da composição" onKeyDown={(e) => { if (e.key === 'Escape') setAnalytic(null); }} onClick={(e) => e.stopPropagation()}><header><h2>Analítico · {uf} / {regime}</h2><button autoFocus onClick={() => setAnalytic(null)}>Fechar</button></header><h3>{analytic.code} · {analytic.description}</h3><p className={styles.muted}>{references.find(r => r.id === referenceId)?.label} · {analytic.unit} · {analytic.group}</p><p><strong>Custo unitário: {money(analytic)}</strong></p>{analytic.attributedToSP ? <p className={styles.notice}>Há insumos com preço atribuído a SP por falta de preço na UF selecionada. Confira essa premissa antes de utilizar a composição.</p> : null}<div className={styles.tablewrap}><table><thead><tr><th>Tipo / código</th><th>Descrição</th><th>Un.</th><th>Coeficiente</th><th>Preço</th><th>Subtotal</th></tr></thead><tbody>{analytic.items.map((i, at) => <tr key={`${i.type}-${i.code}-${at}`}><td>{i.type === 'I' ? 'Insumo' : 'Composição'} {i.code}</td><td>{i.description}</td><td>{i.unit}</td><td className={styles.number}>{Number(i.coefficient).toLocaleString('pt-BR', { maximumFractionDigits: 12 })}</td><td className={styles.number}>{money(i)}</td><td className={styles.number}>{money({ ...i, price: i.subtotal, priceCents: undefined, cost: null, costCents: undefined })}</td></tr>)}</tbody></table></div><p><button className={styles.primary} onClick={copyComposition}>Criar cópia própria</button></p><p className={styles.muted}>Use o catálogo dentro do editor para adicionar serviços ao orçamento e editar a cópia nesta ocorrência.</p></section></div> : null}
    {historyProject ? <ProjectHistory project={historyProject} onClose={() => setHistoryProject(null)} onChanged={async () => { setHistoryProject(null); await loadProjects(); }} /> : null}
  </div>;
}

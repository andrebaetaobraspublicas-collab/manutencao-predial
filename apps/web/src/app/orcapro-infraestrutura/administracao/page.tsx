'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { ORCAPRO_ONLY } from '@/lib/product-config';
import { infraAccess, infraApi, infraItems, type InfraCycle } from '@/lib/infra-api';
import { uploadInfraCatalog, type CatalogBundle } from '@/lib/infra-import';
import InfraShell from '../infra-shell';
import styles from '../../orcapro/workspace.module.css';

type Member = { userId: string; tenantId: string; name: string; email: string; role: string; status: string; deletedAt?: string };
type Account = { userId: string; tenantId: string; name: string; email: string; organizationName: string };
type Policy = { name: string; data: { text: string }; version: number };
type Audit = { id: string; action: string; entity: string; createdAt: string; payload: unknown };
type Stats = { users: { status: string; count: number }[]; projects: { total: number; bytes: number }; cycles: { status: string; count: number }[] };
const situations: Record<string, string> = { ACTIVE: 'Ativo', PENDING: 'Aguardando aprovação', BLOCKED: 'Bloqueado', DRAFT: 'Rascunho', PUBLISHED: 'Publicado', ARCHIVED: 'Arquivado', UPLOADING: 'Recebendo arquivos', QUEUED: 'Aguardando conferência', PROCESSING: 'Conferindo custos', PASSED: 'Conferência aprovada', FAILED: 'Conferência reprovada' };
const download = (value: unknown, name: string) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

export default function InfraAdmin() {
  const [allowed, setAllowed] = useState(false), [self, setSelf] = useState(''), [tab, setTab] = useState('users');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<Member[]>([]), [cycles, setCycles] = useState<InfraCycle[]>([]), [policies, setPolicies] = useState<Policy[]>([]), [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState(''), [accounts, setAccounts] = useState<Account[]>([]), [audits, setAudits] = useState<Audit[]>([]), [auditPage, setAuditPage] = useState(1);
  const [create, setCreate] = useState(false), [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '', organizationSlug: '', role: 'USER', status: 'ACTIVE' });
  const [passwordFor, setPasswordFor] = useState<Member | null>(null), [password, setPassword] = useState('');
  const [bundle, setBundle] = useState<CatalogBundle | null>(null), [files, setFiles] = useState<string[]>([]), [uf, setUf] = useState('SP'), [ref, setRef] = useState(''), [importing, setImporting] = useState(false);
  const reload = useCallback(async () => {
    const [members, references, metrics, texts] = await Promise.all([
      infraApi<{ items: Member[] }>('/admin/users'), infraApi<{ items: InfraCycle[] }>('/admin/cycles'), infraApi<Stats>('/admin/stats'), infraApi<{ items: Policy[] }>('/policies'),
    ]);
    setUsers(infraItems(members)); setCycles(infraItems(references)); setStats(metrics); setPolicies(infraItems(texts));
  }, []);
  useEffect(() => {
    let active = true;
    if (ORCAPRO_ONLY) return;
    void infraAccess().then(async access => {
      if (!access.enabled || access.role !== 'ADMIN') throw new Error('Esta área é exclusiva dos administradores do Infraestrutura.');
      if (active) { setAllowed(true); setSelf(access.userId); const requested = new URLSearchParams(window.location.search).get('tab'); if (requested === 'cycles' || requested === 'catalog') setTab('catalog'); else if (requested && ['users', 'policies', 'audit'].includes(requested)) setTab(requested); }
      await reload();
    }).catch(cause => { if (!active) return; if (cause instanceof ApiError && cause.status === 401) window.location.assign('/login/?next=/orcapro-infraestrutura'); else setError(cause instanceof Error ? cause.message : 'Falha ao validar a administração.'); });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => {
    if (!allowed || tab !== 'audit') return;
    let active = true;
    void infraApi<{ items: Audit[] }>('/admin/audit?page=' + auditPage + '&pageSize=50').then(result => { if (active) setAudits(infraItems(result)); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao consultar auditoria.'); });
    return () => { active = false; };
  }, [allowed, tab, auditPage]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const frame = document.getElementById('infra-importer') as HTMLIFrameElement | null;
      if (!allowed || event.origin !== window.location.origin || event.source !== frame?.contentWindow || event.data?.type !== 'infra-catalog-read') return;
      const candidate = event.data.bundle as CatalogBundle;
      if (!candidate?.raw || !Array.isArray(candidate.raw.comp?.c) || !Array.isArray(candidate.raw.ins?.c) || !Array.isArray(candidate.raw.ufs) || !candidate.raw.ufs.every(u => typeof u === 'string')) { setError('O arquivo não contém um catálogo SICRO válido.'); return; }
      setBundle(candidate); setFiles(Array.isArray(event.data.files) ? event.data.files.filter((f: unknown) => typeof f === 'string') : []); setUf(candidate.raw.ufs[0] || 'SP'); setRef(candidate.raw.ref || ''); setNotice('Leitura concluída. Confira a UF e a referência antes de enviar para validação.');
    };
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
  }, [allowed]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha na operação.'); } finally { setBusy(false); } }
  async function createUser(event: FormEvent) {
    event.preventDefault(); await action(async () => {
      await infraApi('/admin/users', { method: 'POST', body: JSON.stringify({ ...form, organizationSlug: form.organizationSlug.trim().toLowerCase() }) });
      setForm({ name: '', email: '', password: '', organizationName: '', organizationSlug: '', role: 'USER', status: 'ACTIVE' }); setCreate(false); setNotice('Usuário criado com acesso ao Infraestrutura.'); await reload();
    });
  }
  async function update(member: Member, change: { role?: string; status?: string }) {
    await action(async () => { await infraApi('/admin/users/' + member.userId, { method: 'PATCH', body: JSON.stringify({ tenantId: member.tenantId, role: change.role || member.role, status: change.status || member.status }) }); await reload(); setNotice('Acesso atualizado.'); });
  }
  async function upload() {
    if (!bundle) return;
    setImporting(true);
    await action(async () => {
      const ready = { ...bundle };
      if (!ready.pem) {
        const current = cycles.find(c => c.status === 'PUBLISHED');
        if (!current) throw new Error('Selecione também o arquivo JSON do PEM para a primeira importação.');
        ready.pem = await infraApi('/cycles/' + current.id + '/pem');
      }
      await uploadInfraCatalog(ready, uf, ref, files, setNotice); setBundle(null); await reload();
    });
    setImporting(false);
  }
  if (!allowed) return <InfraShell title="Administração do Infraestrutura"><p className={styles.error} role="alert">{ORCAPRO_ONLY ? 'Este programa está disponível no ambiente de desenvolvimento.' : error || 'Validando acesso administrativo…'}</p></InfraShell>;
  return <InfraShell title="Administração do Infraestrutura" admin>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <div className={styles.examples}>
      <div><span>Usuários ativos</span><strong>{Number(stats?.users.find(u => u.status === 'ACTIVE')?.count || 0)}</strong></div>
      <div><span>Projetos registrados</span><strong>{Number(stats?.projects.total || 0)}</strong></div>
      <div><span>Referências publicadas</span><strong>{Number(stats?.cycles.find(c => c.status === 'PUBLISHED')?.count || 0)}</strong></div>
    </div>
    <nav className={styles.actions} aria-label="Seções da administração">{[['users', 'Usuários e acessos'], ['catalog', 'Referências SICRO'], ['policies', 'Privacidade e termos'], ['audit', 'Auditoria']].map(([id, text]) => <button key={id} className={tab === id ? styles.primary : ''} onClick={() => setTab(id)}>{text}</button>)}<button disabled={busy} onClick={() => void action(reload)}>Atualizar</button></nav>
    {tab === 'users' ? <>
      <section className={styles.panel}><div className={styles.sectionHeader}><h2>Usuários e acessos</h2><button className={styles.primary} disabled={busy} onClick={() => setCreate(true)}>Cadastrar usuário</button></div>
        <p className={styles.muted}>Os papéis e a aprovação abaixo controlam o Infraestrutura. A senha pertence à conta compartilhada dos três programas.</p>
        <label>Buscar nome ou e-mail <input value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className={styles.tablewrap}><table><thead><tr><th>Usuário</th><th>Papel</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{users.filter(u => (u.name + ' ' + u.email).toLowerCase().includes(search.toLowerCase())).map(u => <tr key={u.userId + u.tenantId}><td><strong>{u.name}</strong><br />{u.email}{u.deletedAt ? <small> · Excluído</small> : null}</td><td><select aria-label={'Papel de ' + u.name} value={u.role} disabled={busy || u.userId === self} onChange={e => void update(u, { role: e.target.value })}><option value="USER">Usuário</option><option value="ADMIN">Administrador</option></select></td><td>{situations[u.status] || u.status}</td><td><div className={styles.actions}><button disabled={busy || u.userId === self} onClick={() => void update(u, { status: u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' })}>{u.status === 'ACTIVE' ? 'Bloquear' : u.deletedAt ? 'Restaurar acesso' : 'Aprovar acesso'}</button><button disabled={busy || u.userId === self || !!u.deletedAt} onClick={() => { setPasswordFor(u); setPassword(''); }}>Alterar senha</button><button disabled={busy || u.userId === self || !!u.deletedAt} onClick={() => void action(async () => { if (!confirm('Excluir o acesso de ' + u.name + ' ao Infraestrutura? A conta compartilhada e os outros programas serão preservados.')) return; await infraApi('/admin/users/' + u.userId, { method: 'DELETE', body: JSON.stringify({ tenantId: u.tenantId }) }); await reload(); setNotice('Acesso excluído neste programa.'); })}>Excluir acesso</button></div></td></tr>)}</tbody></table></div>
      </section>
      {create ? <section className={styles.panel}><h2>Cadastrar usuário</h2><p className={styles.muted}>Preencha a nova organização ou deixe seus dois campos em branco para usar a sua organização. O acesso inicial será exclusivo do Infraestrutura.</p><form className={styles.form} onSubmit={createUser}>
        <label>Nome<input autoComplete="name" required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>E-mail<input autoComplete="email" type="email" required maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Senha inicial<input autoComplete="new-password" type="password" required minLength={10} maxLength={72} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
        <label>Nome da nova organização<input maxLength={200} value={form.organizationName} onChange={e => setForm({ ...form, organizationName: e.target.value })} /></label>
        <label>Identificador da organização<input maxLength={100} pattern="[a-z0-9][a-z0-9-]{2,99}" placeholder="ex.: minha-empresa" value={form.organizationSlug} onChange={e => setForm({ ...form, organizationSlug: e.target.value.toLowerCase() })} /></label>
        <label>Papel<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="USER">Usuário</option><option value="ADMIN">Administrador</option></select></label>
        <label>Situação<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Ativo</option><option value="PENDING">Aguardar aprovação</option><option value="BLOCKED">Bloqueado</option></select></label>
        <button className={styles.primary} disabled={busy}>Criar usuário</button><button type="button" onClick={() => { setCreate(false); setForm({ ...form, password: '' }); }}>Cancelar</button>
      </form></section> : null}
      {passwordFor ? <section className={styles.panel}><h2>Alterar a senha de {passwordFor.name}</h2><p className={styles.muted}>A alteração vale para o login compartilhado dos três programas e encerra as sessões existentes dessa conta.</p><form className={styles.form} onSubmit={event => { event.preventDefault(); void action(async () => { await infraApi('/admin/users/' + passwordFor.userId + '/password', { method: 'POST', body: JSON.stringify({ newPassword: password }) }); setPassword(''); setPasswordFor(null); setNotice('Senha alterada e sessões anteriores encerradas.'); }); }}><label>Nova senha<input autoComplete="new-password" required type="password" minLength={10} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} /></label><button className={styles.primary} disabled={busy}>Salvar nova senha</button><button type="button" onClick={() => { setPasswordFor(null); setPassword(''); }}>Cancelar</button></form></section> : null}
      <section className={styles.panel}><h2>Conceder acesso a uma conta existente</h2><p className={styles.muted}>Procure uma conta dos outros programas e escolha o vínculo com a organização.</p><form className={styles.form} onSubmit={event => { event.preventDefault(); void action(async () => setAccounts(infraItems(await infraApi<{ items: Account[] }>('/admin/accounts?search=' + encodeURIComponent(search))))); }}><label>Nome ou e-mail<input value={search} onChange={e => setSearch(e.target.value)} maxLength={200} /></label><button disabled={busy}>Procurar conta</button></form><div className={styles.tablewrap}><table><tbody>{accounts.map(a => <tr key={a.userId + a.tenantId}><td>{a.name}<br />{a.email}</td><td>{a.organizationName}</td><td><button disabled={busy} onClick={() => void action(async () => { await infraApi('/admin/users/grant', { method: 'POST', body: JSON.stringify({ userId: a.userId, tenantId: a.tenantId, role: 'USER', status: 'ACTIVE' }) }); await reload(); setNotice('Acesso concedido à conta existente.'); })}>Conceder acesso</button></td></tr>)}</tbody></table></div></section>
    </> : null}
    {tab === 'catalog' ? <>
      <section className={styles.panel}><h2>Referências SICRO</h2><p className={styles.muted}>Uma referência publicada permanece imutável. Arquivar retira a opção de novos projetos; os orçamentos históricos continuam com acesso à sua referência.</p><div className={styles.tablewrap}><table><thead><tr><th>UF / referência</th><th>Publicação</th><th>Conferência</th><th>Ações</th></tr></thead><tbody>{cycles.map(c => <tr key={c.id}><td>{c.uf} · {c.ref}</td><td>{situations[c.status] || c.status}</td><td>{situations[c.importStatus || ''] || c.importStatus}{c.validation?.message ? <p className={styles.muted}>{c.validation.message}</p> : null}</td><td><div className={styles.actions}><button onClick={() => download(c.validation || {}, 'SICRO_' + c.uf + '_' + c.ref.replaceAll('/', '-') + '_conferencia.json')}>Relatório</button>{c.status === 'DRAFT' && c.importStatus === 'PASSED' ? <button disabled={busy} className={styles.primary} onClick={() => void action(async () => { await infraApi('/admin/cycles/' + c.id + '/publish', { method: 'POST' }); await reload(); setNotice('Referência publicada. Os projetos existentes conservam sua referência.'); })}>Publicar</button> : null}{c.status === 'PUBLISHED' ? <button disabled={busy} onClick={() => void action(async () => { if (!confirm('Arquivar esta referência para novos projetos? Os projetos históricos continuarão funcionando.')) return; await infraApi('/admin/cycles/' + c.id + '/archive', { method: 'POST' }); await reload(); })}>Arquivar</button> : null}{c.status === 'DRAFT' && !['QUEUED', 'PROCESSING'].includes(c.importStatus || '') ? <button disabled={busy} onClick={() => void action(async () => { if (!confirm('Excluir este rascunho de importação?')) return; await infraApi('/admin/cycles/' + c.id, { method: 'DELETE' }); await reload(); })}>Excluir rascunho</button> : null}</div></td></tr>)}</tbody></table></div></section>
      <section className={styles.panel}><h2>Importar uma nova referência</h2><p className={styles.muted}>Selecione os relatórios oficiais XLSX ou o JSON exportado. O motor original confere os custos no servidor antes de permitir a publicação. Se o PEM não for fornecido, a biblioteca da referência publicada será reutilizada.</p>
        <iframe id="infra-importer" title="Leitura de relatórios SICRO" src="/infraestrutura-editor/import.html" style={{ width: '100%', minHeight: 270, border: '1px solid #dde1e5', borderRadius: 5 }} />
        {bundle ? <div className={styles.form}><label>UF<select value={uf} onChange={e => setUf(e.target.value)}>{bundle.raw.ufs.map(u => <option key={u}>{u}</option>)}</select></label><label>Referência<input required placeholder="07/2026" pattern="(0[1-9]|1[0-2])/20[0-9]{2}" value={ref} onChange={e => setRef(e.target.value)} /></label><span>{bundle.raw.comp.c.length.toLocaleString('pt-BR')} composições · {bundle.raw.ins.c.length.toLocaleString('pt-BR')} insumos</span><button className={styles.primary} disabled={busy || importing || !/^(0[1-9]|1[0-2])\/20\d{2}$/.test(ref)} onClick={() => void upload()}>Enviar para conferência</button></div> : null}
      </section>
    </> : null}
    {tab === 'policies' ? <section className={styles.panel}><h2>Política de privacidade e termos</h2><p className={styles.muted}>Os textos abaixo são exibidos aos usuários. Revise-os conforme a operação e a política de retenção adotadas antes de oferecer o serviço comercialmente.</p>{policies.map(p => <form key={p.name} onSubmit={event => { event.preventDefault(); void action(async () => { await infraApi('/admin/policies/' + p.name, { method: 'PUT', body: JSON.stringify({ text: p.data.text, version: p.version }) }); await reload(); setNotice('Texto atualizado.'); }); }}><label>{p.name === 'privacy' ? 'Política de privacidade' : 'Termos de uso'}<textarea required maxLength={100000} rows={12} style={{ display: 'block', width: '100%', margin: '12px 0', padding: 12, font: 'inherit', border: '1px solid #c9d1d7' }} value={p.data.text} onChange={e => setPolicies(policies.map(item => item.name === p.name ? { ...item, data: { text: e.target.value } } : item))} /></label><button disabled={busy}>Salvar texto</button></form>)}</section> : null}
    {tab === 'audit' ? <section className={styles.panel}><h2>Auditoria</h2><p className={styles.muted}>Importações, publicação de referências, alterações de acesso e gravações de projetos são registradas. Senhas não são registradas.</p><div className={styles.tablewrap}><table><thead><tr><th>Data</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>{audits.map(a => <tr key={a.id}><td>{new Date(a.createdAt).toLocaleString('pt-BR')}</td><td>{a.action}</td><td>{a.entity}</td><td><details><summary>Ver registro</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{typeof a.payload === 'string' ? a.payload : JSON.stringify(a.payload, null, 2)}</pre></details></td></tr>)}</tbody></table></div><div className={styles.pager}><button disabled={auditPage === 1} onClick={() => setAuditPage(auditPage - 1)}>Anterior</button><span>Página {auditPage}</span><button disabled={audits.length < 50} onClick={() => setAuditPage(auditPage + 1)}>Próxima</button></div></section> : null}
  </InfraShell>;
}

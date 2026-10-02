'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiDownload, apiFetch } from '@/lib/api';
import styles from './workspace.module.css';

type Reference = { id: string; label: string; status: string };
type Project = { id: string; name: string; version: number };
type Version = { version: number; name: string; referenceId: string; uf: string; regime: string; createdAt: string };
type Report = { inputs?: number; compositions?: number; analyticItems?: number; prices?: number; missingPrices?: number; status?: string; checksum?: string };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.';
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Documento de projeto inválido.');
  return value as Record<string, unknown>;
};

export function ProjectImport({ references, defaultReferenceId, onImported }: { references: Reference[]; defaultReferenceId: string; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [referenceId, setReferenceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = referenceId || defaultReferenceId;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!file || file.size > 15 * 1024 * 1024) throw new Error('Selecione um projeto JSON de até 15 MB.');
      const document = record(JSON.parse(await file.text()));
      const project = record(document.project ?? document);
      const target = references.find(r => r.id === selected);
      if (typeof document.referenceId === 'string' && document.referenceId !== selected) throw new Error('Selecione a mesma referência histórica registrada no arquivo OrçaPro.');
      const oldLabel = typeof document.baseRef === 'string' ? document.baseRef : '';
      if (oldLabel && target && !target.label.startsWith(oldLabel)) throw new Error(`O arquivo foi elaborado com a referência ${oldLabel}. Selecione essa referência para preservar os cálculos históricos.`);
      const result = await apiFetch<{ project: { id: string } }>('/orcapro/projects/import', { method: 'POST', body: JSON.stringify({ name: String(project.name || file.name).slice(0, 160), referenceId: selected, uf: project.uf ?? 'SP', regime: project.rg ?? 'SD', data: project }) });
      await onImported(); window.location.assign(`/orcapro/editor?id=${encodeURIComponent(result.project.id)}`);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <section className={styles.panel}><h2>Importar orçamento existente</h2><p className={styles.muted}>Selecione um arquivo .orcaplan.json ou .orcapro.json e a referência em que ele foi elaborado. A importação cria um orçamento privado; seu arquivo original continua disponível.</p><form className={styles.form} onSubmit={submit}><label>Arquivo<input type="file" accept=".json,.orcaplan.json,.orcapro.json" required onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><label>Referência histórica<select required value={selected} onChange={e => setReferenceId(e.target.value)}><option value="" disabled>Selecione a referência</option>{references.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label><button disabled={busy || !selected}>{busy ? 'Importando…' : 'Importar orçamento'}</button></form>{error ? <p className={styles.error} role="alert">{error}</p> : null}</section>;
}

export function ProjectHistory({ project, onClose, onChanged }: { project: Project; onClose: () => void; onChanged: () => Promise<void> }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch<Version[]>(`/orcapro/projects/${project.id}/versions`).then(rows => { if (active) setVersions(rows); }).catch(cause => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [project.id]);
  async function restore(version: number) {
    setBusy(true); setError('');
    try {
      await apiFetch(`/orcapro/projects/${project.id}/restore`, { method: 'POST', body: JSON.stringify({ expectedVersion: project.version, version }) });
      await onChanged();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true); setError('');
    try { await apiFetch(`/orcapro/projects/${project.id}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion: project.version }) }); await onChanged(); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function download() {
    try { await apiDownload(`/orcapro/projects/${project.id}/export`, `${project.name.replace(/[\\/:*?"<>|]/g, '_')}.orcapro.json`); }
    catch (cause) { setError(errorText(cause)); }
  }
  return <div className={styles.overlay} onClick={onClose}><section className={styles.drawer} role="dialog" aria-modal="true" aria-label="Versões do orçamento" onKeyDown={e => { if (e.key === 'Escape') onClose(); }} onClick={e => e.stopPropagation()}><header><h2>{project.name}</h2><button autoFocus onClick={onClose}>Fechar</button></header><p className={styles.muted}>Restaurar cria uma nova versão com o conteúdo e a referência do histórico selecionado.</p>{error ? <p className={styles.error} role="alert">{error}</p> : null}<div className={styles.tablewrap} aria-busy={busy}><table><thead><tr><th>Versão</th><th>Salva em</th><th>UF / regime</th><th /></tr></thead><tbody>{versions.map(v => <tr key={v.version}><td>{v.version}</td><td>{new Date(v.createdAt).toLocaleString('pt-BR')}</td><td>{v.uf} / {v.regime}</td><td><button disabled={busy || v.version === project.version} onClick={() => restore(v.version)}>Restaurar versão</button></td></tr>)}</tbody></table></div><p className={styles.actions}><button onClick={download}>Exportar projeto JSON</button><button disabled={busy} onClick={() => setArchiveConfirm(true)}>Arquivar orçamento</button></p>{archiveConfirm ? <div className={styles.panel}><p>Arquivar retira o orçamento da lista de ativos. Você poderá recuperá-lo em “Ver arquivados”.</p><button disabled={busy} onClick={archive}>Arquivar este orçamento</button> <button onClick={() => setArchiveConfirm(false)}>Cancelar</button></div> : null}</section></div>;
}

export function ReferenceImport({ onImported }: { onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [revision, setRevision] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setReport(null);
    try {
      if (!file || file.size > 20 * 1024 * 1024) throw new Error('Selecione um arquivo SINAPI de até 20 MB.');
      let result: { report: Report };
      if (/\.xlsx$/i.test(file.name)) {
        const data = new FormData(); data.set('file', file); data.set('revision', String(revision));
        result = await apiFetch('/orcapro/admin/imports/file', { method: 'POST', body: data });
      } else {
        const document = record(JSON.parse(await file.text()));
        result = await apiFetch('/orcapro/admin/imports', { method: 'POST', body: JSON.stringify({ raw: document.raw ?? document, sourceName: file.name, revision }) });
      }
      setReport(result.report); await onImported();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <section className={styles.panel}><h2>Importar referência SINAPI</h2><p className={styles.muted}>Envie o relatório oficial XLSX ou uma base SINAPI JSON do aplicativo. A nova referência será criada como rascunho, sem substituir as publicadas. Depois confira, valide e publique.</p><form className={styles.form} onSubmit={submit}><label>Arquivo SINAPI<input type="file" required accept=".xlsx,.json" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><label>Revisão<input type="number" min={1} max={999} required value={revision} onChange={e => setRevision(Number(e.target.value))} /></label><button disabled={busy}>{busy ? 'Processando importação…' : 'Importar como rascunho'}</button></form>{error ? <p className={styles.error} role="alert">{error}</p> : null}{report ? <div className={styles.report} role="status"><h3>Relatório da importação</h3><dl><dt>Insumos</dt><dd>{report.inputs?.toLocaleString('pt-BR')}</dd><dt>Composições</dt><dd>{report.compositions?.toLocaleString('pt-BR')}</dd><dt>Linhas analíticas</dt><dd>{report.analyticItems?.toLocaleString('pt-BR')}</dd><dt>Preços por contexto</dt><dd>{report.prices?.toLocaleString('pt-BR')}</dd><dt>Preços em branco</dt><dd>{report.missingPrices?.toLocaleString('pt-BR')}</dd><dt>Situação</dt><dd>Rascunho · validação pendente</dd></dl></div> : null}</section>;
}

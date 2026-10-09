'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiDownload, apiFetch, apiImportStream } from '@/lib/api';
import styles from './workspace.module.css';

type Reference = { id: string; label: string; status: string };
type Counts = { added: number; changed: number; removed: number; globallyNew: number; priceChanged: number; analyticChanged?: number };
type Report = { inputs: number; compositions: number; analyticItems: number; prices: number; missingPrices: number; ufs: string[]; regimes: string[]; sourceValidation?: { total: number; ok: number }; comparison?: { baseline: { id: string; label: string } | null; inputs: Counts; compositions: Counts; total: number } | null };
type Difference = { kind: 'I'|'C'; code: string; description: string; unit: string; status: 'ADDED'|'CHANGED'|'REMOVED'; globallyNew: boolean; fields: string[]; before: Record<string,string|number> | null; after: Record<string,string|number> | null; priceContexts: number; priceUfs: string[]; priceRegimes: string[]; analyticChanges?: { item: string; before: string[]; after: string[] }[] };
type Result = { referenceId: string; sourceName: string; createdAt: string; report: Report; items: Difference[]; total: number; page: number; pageSize: number; comparisonAvailable: boolean };
const number = (n: number | undefined) => n?.toLocaleString('pt-BR') ?? '—';
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.';
const labels: Record<string,string> = { ADDED: 'Incluído nesta referência', CHANGED: 'Alterado', REMOVED: 'Ausente nesta referência', description: 'Descrição', unit: 'Unidade', nature: 'Classificação', origin: 'Origem', group: 'Grupo', situation: 'Situação', analyticItems: 'Linhas analíticas', analytic: 'Estrutura analítica', prices: 'Preços por UF/regime' };

export function ReferenceImport({ references, defaultReferenceId, onImported }: { references: Reference[]; defaultReferenceId: string; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null), [revision, setRevision] = useState(1);
  const [baseline, setBaseline] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [percent, setPercent] = useState<number | null>(null), [phase, setPhase] = useState('');
  const [completed, setCompleted] = useState<{ id: string; report: Report } | null>(null);
  const available = references.filter(r => ['PUBLISHED','ARCHIVED'].includes(r.status));
  const selected = baseline || (available.some(r => r.id === defaultReferenceId) ? defaultReferenceId : available[0]?.id ?? '');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setCompleted(null); setPercent(null); setPhase('Enviando arquivo ao servidor…');
    try {
      if (!file || file.size > 40 * 1024 * 1024) throw new Error('Selecione um arquivo SINAPI XLSX de até 40 MB ou JSON de até 15 MB.');
      if (!Number.isInteger(revision) || revision < 1 || revision > 999) throw new Error('A revisão deve ser um número inteiro entre 1 e 999.');
      let path: string, body: FormData | string;
      if (/\.xlsx$/i.test(file.name)) {
        const form = new FormData(); form.set('file', file); form.set('revision', String(revision));
        if (selected) form.set('baselineReferenceId', selected);
        body = form; path = '/orcapro/admin/imports/file/stream';
      } else if (/\.json$/i.test(file.name)) {
        if (file.size > 15 * 1024 * 1024) throw new Error('O arquivo JSON deve ter até 15 MB.');
        const document = JSON.parse(await file.text());
        if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Base SINAPI JSON inválida.');
        body = JSON.stringify({ raw: document.raw ?? document, sourceName: file.name, revision, ...(selected ? { baselineReferenceId: selected } : {}) }); path = '/orcapro/admin/imports/stream';
      } else throw new Error('Envie um arquivo .xlsx ou .json.');
      const result = await apiImportStream<{ reference: { id: string }; report: Report }>(path, { method: 'POST', body }, (text, value) => { setPhase(text); setPercent(value); });
      setCompleted({ id: result.reference.id, report: result.report });
      try { await onImported(); } catch { setError('A importação foi concluída, mas a lista de referências não pôde ser atualizada. Recarregue a página para consultá-la.'); }
    } catch (cause) { setError(errorText(cause)); setPhase('Importação não confirmada'); }
    finally { setBusy(false); }
  }
  const step = percent === null ? 0 : percent < 60 ? 1 : percent < 73 ? 2 : percent < 100 ? 3 : 4;
  return <section className={styles.panel}>
    <h2>Assistente de importação SINAPI</h2>
    <p className={styles.muted}>Envie o XLSX oficial da CAIXA ou uma base SINAPI JSON. Escolha a referência de comparação para conferir novidades e mudanças. A importação cria um rascunho; a validação e a publicação são ações posteriores.</p>
    <form className={styles.form} onSubmit={submit}>
      <label>Arquivo SINAPI<input type="file" required disabled={busy} accept=".xlsx,.json" onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); setCompleted(null); setPhase(''); }} /></label>
      <label>Comparar com<select disabled={busy} value={selected} onChange={e => setBaseline(e.target.value)}>{!available.length ? <option value="">Primeira referência — sem comparação anterior</option> : available.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <label>Revisão<input type="number" min={1} max={999} required disabled={busy} value={revision} onChange={e => setRevision(Number(e.target.value))} /></label>
      <button className={styles.primary} disabled={busy}>{busy ? 'Importação em andamento…' : 'Importar e comparar como rascunho'}</button>
    </form>
    {phase ? <div className={styles.importProgress} aria-busy={busy}>
      <div><strong role="status">{phase}</strong><span>{percent === null ? 'Envio do arquivo' : `${number(percent)}%`}</span></div>
      <progress aria-label="Andamento da importação SINAPI" max={100} value={percent === null ? undefined : percent} />
      <ol>{['Envio','Leitura e conferência','Comparação','Gravação','Rascunho concluído'].map((title,i) => <li key={title} className={i === step ? styles.importStepActive : i < step ? styles.importStepDone : ''}>{title}</li>)}</ol>
      <p className={styles.muted}>O percentual acompanha as etapas de processamento e os lotes gravados. A confirmação de 100% ocorre depois da transação. Mantenha esta tela aberta para acompanhar.</p>
    </div> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {completed ? <><p className={styles.notice}>Rascunho importado com sucesso. Confira o relatório abaixo e valide a referência antes de publicá-la.</p><ReferenceReport referenceId={completed.id} initialReport={completed.report} /></> : null}
  </section>;
}

export function ReferenceReport({ referenceId, initialReport, onClose }: { referenceId: string; initialReport?: Report; onClose?: () => void }) {
  const [result, setResult] = useState<Result | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [kind, setKind] = useState(''), [status, setStatus] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const params = new URLSearchParams({ page: String(page), pageSize: '30', ...(kind ? { kind } : {}), ...(status ? { status } : {}), ...(search ? { search } : {}) }).toString();
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setBusy(true); setError('');
      apiFetch<Result>(`/orcapro/admin/references/${encodeURIComponent(referenceId)}/import-report?${params}`).then(data => { if (active) setResult(data); }).catch(cause => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setBusy(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [referenceId, params]);
  async function download() {
    setExporting(true); setError('');
    try { await apiDownload(`/orcapro/admin/references/${encodeURIComponent(referenceId)}/import-report.csv?${params}`, 'comparacao-sinapi.csv'); }
    catch (cause) { setError(errorText(cause)); } finally { setExporting(false); }
  }
  const report = result?.referenceId === referenceId ? result.report : initialReport;
  const comparison = report?.comparison;
  return <section className={styles.importReport} aria-label="Relatório da importação SINAPI">
    <header className={styles.sectionHeader}><h3>Relatório da importação</h3>{onClose ? <button onClick={onClose}>Fechar relatório</button> : null}</header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {report ? <>
      <div className={styles.importStats}>
        <div><span>Insumos na referência</span><strong>{number(report.inputs)}</strong></div>
        <div><span>Composições na referência</span><strong>{number(report.compositions)}</strong></div>
        <div><span>Insumos novos no catálogo</span><strong>{number(comparison?.inputs.globallyNew)}</strong><small>{number(comparison?.inputs.added)} incluídos em relação à comparação</small></div>
        <div><span>Composições novas no catálogo</span><strong>{number(comparison?.compositions.globallyNew)}</strong><small>{number(comparison?.compositions.added)} incluídas em relação à comparação</small></div>
      </div>
      <p className={styles.muted}>{number(report.analyticItems)} linhas analíticas · {number(report.prices)} preços por contexto · {number(report.missingPrices)} preços ausentes · {report.ufs?.length ?? 0} UFs · {report.regimes?.join(' / ')}.</p>
      {report.sourceValidation ? <p className={styles.muted}>Conferência com o XLSX: {number(report.sourceValidation.ok)} de {number(report.sourceValidation.total)} custos coincidentes com o relatório oficial.</p> : null}
      {comparison ? <>
        <p><strong>Comparação: {comparison.baseline?.label ?? 'sem referência anterior'}.</strong> “Novo no catálogo” identifica um código nunca cadastrado; “incluído” significa presente no novo mês e ausente na referência comparada.</p>
        <div className={styles.tablewrap}><table><thead><tr><th>Tipo</th><th>Incluídos</th><th>Alterados</th><th>Ausentes</th><th>Com preços alterados</th><th>Com analítico alterado</th></tr></thead><tbody>{([['Insumos',comparison.inputs],['Composições',comparison.compositions]] as const).map(([title, counts]) => <tr key={title}><td>{title}</td><td>{number(counts.added)}</td><td>{number(counts.changed)}</td><td>{number(counts.removed)}</td><td>{number(counts.priceChanged)}</td><td>{title === 'Composições' ? number(counts.analyticChanged) : '—'}</td></tr>)}</tbody></table></div>
        <p className={styles.muted}>Custos de composição são recompostos com o motor SINAPI e comparados por UF/regime. Preço ausente é diferente de zero; valores atribuídos a SP seguem a regra do motor. Analíticos mostram mudanças nos códigos, coeficientes e ocorrências. Ausência no novo mês preserva a referência histórica. Créditos e premissas tributárias dos projetos não fazem parte desta comparação.</p>
      </> : <p className={styles.muted}>Esta importação anterior não possui comparação registrada. O relatório básico continua disponível.</p>}
    </> : null}
    {comparison ? <>
      <div className={styles.importFilters}>
        <label>Tipo<select value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}><option value="">Insumos e composições</option><option value="I">Insumos</option><option value="C">Composições</option></select></label>
        <label>Diferenças<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todas</option><option value="NEW">Novos no catálogo</option><option value="ADDED">Incluídos nesta referência</option><option value="CHANGED">Alterados</option><option value="REMOVED">Ausentes nesta referência</option></select></label>
        <label>Pesquisar código ou descrição<input type="search" value={search} maxLength={150} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
        <button disabled={busy || exporting} onClick={download}>{exporting ? 'Exportando…' : 'Exportar diferenças em CSV'}</button>
      </div>
      <div className={styles.tablewrap} aria-busy={busy}><table><thead><tr><th>Código / tipo</th><th>Descrição / unidade</th><th>Situação</th><th>O que mudou</th></tr></thead><tbody>{result?.items.map(item => <tr key={`${item.kind}:${item.code}`}>
        <td className={styles.code}>{item.code}<small className={styles.importSmall}>{item.kind === 'I' ? 'Insumo' : 'Composição'}</small></td>
        <td>{item.description}<small className={styles.importSmall}>{item.unit}</small></td>
        <td>{labels[item.status]}{item.globallyNew ? <small className={styles.importSmall}>Novo no catálogo</small> : null}</td>
        <td>{item.fields.map(field => labels[field] ?? field).join(', ') || (item.status === 'ADDED' ? 'Cadastro incluído' : 'Ausente do novo mês')}
          {item.priceContexts ? <small className={styles.importSmall}>{number(item.priceContexts)} contextos · {item.priceUfs.join(', ')} · {item.priceRegimes.join(' / ')}</small> : null}
          <details className={styles.importDetails}><summary>Conferir alterações</summary>{(item.status === 'CHANGED' ? item.fields : Object.keys(item.after ?? item.before ?? {})).filter(field => !['prices','analytic'].includes(field)).map(field => <p key={field}><b>{labels[field] ?? field}:</b> {String(item.before?.[field] ?? 'Ausente')} → {String(item.after?.[field] ?? 'Ausente')}</p>)}
            {item.analyticChanges?.map(change => <p key={change.item}><b>{change.item}:</b> {change.before.join(' + ') || 'Ausente'} → {change.after.join(' + ') || 'Ausente'}</p>)}
            {item.priceContexts ? <p>Os preços variaram nos contextos indicados acima. Consulte os valores da referência desejada no catálogo e na aba “Preços por UF”.</p> : null}
          </details>
        </td>
      </tr>)}</tbody></table></div>
      <div className={styles.pager}><span role="status">{busy ? 'Carregando diferenças…' : `${number(result?.total)} diferenças encontradas`}</span><button disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page}</span><button disabled={busy || !result || page * 30 >= result.total} onClick={() => setPage(page + 1)}>Próxima</button></div>
      {!busy && result && !result.items.length ? <p className={styles.muted}>Nenhuma diferença atende aos filtros selecionados.</p> : null}
    </> : null}
  </section>;
}

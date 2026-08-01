'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  MapPin,
  Paperclip,
  PlayCircle,
  RefreshCw,
  Upload,
  UserRound,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useState, useEffect } from 'react';
import { PriorityBadge, StatusBadge } from '@/components/badge';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, apiFileUrl, ApiError } from '@/lib/api';
import { BRL, formatDateTime } from '@/lib/format';
import { labelFor, statusLabels } from '@/lib/labels';
import type { WorkOrder } from '@/lib/types';

type Attachment = {
  id: string; kind: string; originalName: string; mimeType: string; sizeBytes: string; createdAt: string;
};
type Pendency = {
  id: string; reason: string; status: string; dueAt?: string | null; createdAt: string; resolvedAt?: string | null; resolution?: string | null;
};
type StatusHistory = {
  id: string; fromStatus?: string | null; toStatus: string; note?: string | null; changedAt: string; changedBy: { id: string; name: string };
};
type DetailedWorkOrder = Omit<WorkOrder, 'pendencies'> & {
  openedAt: string;
  slaResponseDeadline?: string | null;
  slaResolutionDeadline?: string | null;
  estimatedCost?: string | number | null;
  approvedCost?: string | number | null;
  finalCost?: string | number | null;
  attachments: Attachment[];
  pendencies: Pendency[];
  statusHistory: StatusHistory[];
  budget?: { id: string; status: string; total: string | number; items: unknown[] } | null;
  satisfaction?: { score: number; npsScore?: number | null; comment?: string | null } | null;
};

const TRANSITIONS: Record<string, string[]> = {
  OPEN: ['TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'CANCELED'],
  TRIAGED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['WAITING_APPROVAL', 'COMPLETED', 'CANCELED'],
  PENDING: ['CANCELED'],
  WAITING_APPROVAL: ['IN_PROGRESS', 'COMPLETED', 'CANCELED'],
  COMPLETED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELED: [],
};

const PENDENCY_ALLOWED_STATUSES = new Set([
  'OPEN',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING',
  'WAITING_APPROVAL',
]);

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [workOrder, setWorkOrder] = useState<DetailedWorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transitionStatus, setTransitionStatus] = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [pendencyReason, setPendencyReason] = useState('');
  const [pendencyDueAt, setPendencyDueAt] = useState('');
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [attachmentKind, setAttachmentKind] = useState('PHOTO_BEFORE');
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(() => {
    apiFetch<DetailedWorkOrder>(`/work-orders/${id}`)
      .then((data) => {
        setWorkOrder(data);
        setTransitionStatus(TRANSITIONS[data.status]?.[0] ?? '');
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'A operação não pôde ser concluída.');
    } finally {
      setBusy(false);
    }
  }

  function transition(event: FormEvent) {
    event.preventDefault();
    if (!transitionStatus) return;
    void run(() => apiFetch(`/work-orders/${id}/transitions`, {
      method: 'POST', body: JSON.stringify({ toStatus: transitionStatus, note: transitionNote || undefined }),
    }));
  }

  function addPendency(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await apiFetch(`/work-orders/${id}/pendencies`, {
        method: 'POST',
        body: JSON.stringify({ reason: pendencyReason, dueAt: pendencyDueAt ? new Date(pendencyDueAt).toISOString() : undefined }),
      });
      setPendencyReason(''); setPendencyDueAt('');
    });
  }

  function resolvePendency(pendencyId: string) {
    const text = resolution[pendencyId]?.trim();
    if (!text) return;
    void run(async () => {
      await apiFetch(`/work-orders/${id}/pendencies/${pendencyId}/resolve`, {
        method: 'PATCH', body: JSON.stringify({ resolution: text }),
      });
      setResolution((current) => ({ ...current, [pendencyId]: '' }));
    });
  }

  function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    void run(async () => {
      const body = new FormData();
      body.append('kind', attachmentKind);
      body.append('file', file);
      await apiFetch(`/work-orders/${id}/attachments`, { method: 'POST', body });
      setFile(null);
      const input = document.getElementById('attachmentFile') as HTMLInputElement | null;
      if (input) input.value = '';
    });
  }

  if (loading && !workOrder) return <LoadingPanel label="Carregando a ordem de serviço…" />;
  if (!workOrder) return <div className="page-container"><div className="notice error">{error || 'Ordem de serviço não encontrada.'}</div></div>;

  const openPendencies = workOrder.pendencies.filter((item) => item.status === 'OPEN');
  const allowedTransitions = workOrder.hasOpenPendency
    ? (TRANSITIONS[workOrder.status] ?? []).filter((status) => status === 'CANCELED')
    : TRANSITIONS[workOrder.status] ?? [];
  const canAddPendency = PENDENCY_ALLOWED_STATUSES.has(workOrder.status);

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <div className="actions" style={{ marginBottom: 9 }}><StatusBadge value={workOrder.status} /><PriorityBadge value={workOrder.priority} />{workOrder.hasOpenPendency ? <span className="badge warning"><AlertTriangle size={13} /> pendência aberta</span> : null}</div>
          <h1>{workOrder.number} — {workOrder.title}</h1>
          <p>{workOrder.description}</p>
        </div>
        <div className="actions"><button className="btn btn-secondary" type="button" onClick={load}><RefreshCw size={16} /> Atualizar</button><Link className="btn btn-secondary" href="/ordens-servico"><ArrowLeft size={16} /> Voltar</Link></div>
      </header>
      {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}

      <div className="detail-grid">
        <div className="grid">
          <section className="card">
            <div className="card-header"><div><h2>Dados da demanda</h2><p>Informações operacionais e dimensões analíticas da OS.</p></div></div>
            <div className="card-body detail-list">
              <Detail icon={MapPin} label="Edificação" value={`${workOrder.building.code} — ${workOrder.building.name}`} note={workOrder.locationDetail || undefined} />
              <Detail icon={UserRound} label="Demandante" value={workOrder.requester.name} note={workOrder.requester.email} />
              <Detail icon={FileText} label="Contrato principal" value={workOrder.contracts.find((item) => item.isPrimary)?.contract.code || 'Não definido'} note={workOrder.contracts.find((item) => item.isPrimary)?.contract.object} />
              <Detail icon={Wrench} label="Fornecedor" value={workOrder.supplier ? workOrder.supplier.tradeName || workOrder.supplier.legalName : 'Não definido'} />
              <Detail icon={CalendarDays} label="Abertura" value={formatDateTime(workOrder.openedAt)} note={`Prazo operacional: ${formatDateTime(workOrder.dueAt)}`} />
              <Detail icon={Clock3} label="SLA de resolução" value={formatDateTime(workOrder.slaResolutionDeadline)} note={`Resposta até ${formatDateTime(workOrder.slaResponseDeadline)}`} />
              <Detail icon={FileText} label="Custos" value={`Estimado: ${workOrder.estimatedCost ? BRL.format(Number(workOrder.estimatedCost)) : '—'}`} note={`Final: ${workOrder.finalCost ? BRL.format(Number(workOrder.finalCost)) : '—'}`} />
              <Detail icon={Paperclip} label="Documentação" value={`${workOrder.attachments.length} anexo(s)`} note={`${workOrder.statusHistory.length} evento(s) no histórico`} />
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Pendências</h2><p>Motivo, responsável e prazo para desbloqueio da execução.</p></div><span className={`badge ${openPendencies.length ? 'warning' : 'success'}`}>{openPendencies.length} aberta(s)</span></div>
            <div className="card-body">
              {openPendencies.map((pendency) => <div key={pendency.id} style={{ padding: '15px 0', borderBottom: '1px solid var(--border)' }}><strong style={{ fontSize: '.8rem' }}>{pendency.reason}</strong><span className="table-secondary">Criada em {formatDateTime(pendency.createdAt)} · prazo {formatDateTime(pendency.dueAt)}</span><div className="actions" style={{ marginTop: 11 }}><input className="input" placeholder="Descreva como a pendência foi resolvida" value={resolution[pendency.id] || ''} onChange={(event) => setResolution({ ...resolution, [pendency.id]: event.target.value })} /><button className="btn btn-secondary" type="button" disabled={busy || !resolution[pendency.id]?.trim()} onClick={() => resolvePendency(pendency.id)}><CheckCircle2 size={16} /> Resolver</button></div></div>)}
              {!openPendencies.length ? <p className="table-secondary">Não há pendências abertas nesta ordem.</p> : null}
              {canAddPendency ? <form onSubmit={addPendency} style={{ marginTop: 18 }}><div className="form-grid"><div className="field col-8"><label htmlFor="pendencyReason">Nova pendência</label><input className="input" id="pendencyReason" required minLength={3} placeholder="Ex.: aguardando peça, autorização ou acesso ao local" value={pendencyReason} onChange={(event) => setPendencyReason(event.target.value)} /></div><div className="field col-4"><label htmlFor="pendencyDueAt">Prazo de solução</label><input className="input" id="pendencyDueAt" type="datetime-local" value={pendencyDueAt} onChange={(event) => setPendencyDueAt(event.target.value)} /></div></div><button className="btn btn-secondary" type="submit" disabled={busy} style={{ marginTop: 11 }}><AlertTriangle size={16} /> Registrar pendência</button></form> : null}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Fotos, notas fiscais e documentos</h2><p>Arquivos protegidos e vinculados à ordem de serviço.</p></div></div>
            <div className="card-body">
              <div className="table-wrapper"><table className="data-table"><thead><tr><th>Documento</th><th>Tipo</th><th>Data</th><th></th></tr></thead><tbody>{workOrder.attachments.map((attachment) => <tr key={attachment.id}><td><span className="table-primary">{attachment.originalName}</span><span className="table-secondary">{attachment.mimeType} · {Math.max(1, Math.round(Number(attachment.sizeBytes) / 1024))} KB</span></td><td><span className="badge neutral">{attachment.kind.replaceAll('_', ' ').toLowerCase()}</span></td><td>{formatDateTime(attachment.createdAt)}</td><td><a className="btn btn-ghost" href={apiFileUrl(`/work-orders/${id}/attachments/${attachment.id}/download`)}><Download size={15} /> Baixar</a></td></tr>)}{!workOrder.attachments.length ? <tr><td colSpan={4}>Ainda não há anexos.</td></tr> : null}</tbody></table></div>
              <form onSubmit={upload} className="form-grid" style={{ marginTop: 18 }}><div className="field col-4"><label htmlFor="attachmentKind">Classificação</label><select className="select" id="attachmentKind" value={attachmentKind} onChange={(event) => setAttachmentKind(event.target.value)}><option value="PHOTO_BEFORE">Foto antes</option><option value="PHOTO_DURING">Foto durante</option><option value="PHOTO_AFTER">Foto depois</option><option value="INVOICE_PDF">Nota fiscal em PDF</option><option value="TECHNICAL_REPORT">Relatório técnico</option><option value="QUOTATION">Orçamento/cotação</option><option value="OTHER_DOCUMENT">Outro documento</option></select></div><div className="field col-6"><label htmlFor="attachmentFile">Arquivo</label><input className="input" id="attachmentFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></div><div className="field col-2"><label>&nbsp;</label><button className="btn btn-secondary" type="submit" disabled={busy || !file}><Upload size={16} /> Enviar</button></div></form>
            </div>
          </section>
        </div>

        <aside className="grid" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-header"><div><h3>Alterar etapa da OS</h3><p>Transições controladas e auditáveis.</p></div><PlayCircle size={19} /></div>
            <div className="card-body">
              {allowedTransitions.length ? <form className="grid" onSubmit={transition}><div className="field"><label htmlFor="transitionStatus">Próximo status</label><select className="select" id="transitionStatus" value={transitionStatus} onChange={(event) => setTransitionStatus(event.target.value)}>{allowedTransitions.map((status) => <option key={status} value={status}>{labelFor(status, statusLabels)}</option>)}</select></div><div className="field"><label htmlFor="transitionNote">Observação</label><textarea className="textarea" id="transitionNote" style={{ minHeight: 85 }} value={transitionNote} onChange={(event) => setTransitionNote(event.target.value)} placeholder="Justificativa ou informação de execução" /></div><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Processando…' : 'Confirmar transição'}</button></form> : <div className="notice">Esta OS está em estado terminal e não admite novas transições.</div>}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h3>Histórico da OS</h3><p>Trilha cronológica de status.</p></div></div>
            <div className="card-body"><div className="timeline">{workOrder.statusHistory.map((item) => <div className="timeline-item" key={item.id}><strong>{labelFor(item.toStatus, statusLabels)}</strong><span>{item.changedBy.name} · {formatDateTime(item.changedAt)}</span>{item.note ? <span>{item.note}</span> : null}</div>)}</div></div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value, note }: { icon: typeof MapPin; label: string; value: string; note?: string }) {
  return <div className="detail-item"><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {label}</span><strong>{value}</strong>{note ? <span>{note}</span> : null}</div>;
}

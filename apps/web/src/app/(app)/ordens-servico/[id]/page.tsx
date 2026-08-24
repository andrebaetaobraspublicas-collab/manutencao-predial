'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Calculator,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  History,
  MapPin,
  MessageSquareText,
  Paperclip,
  Pencil,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Upload,
  UserRound,
  Wrench,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PriorityBadge, StatusBadge } from '@/components/badge';
import { LoadingPanel } from '@/components/loading';
import { WorkOrderChecklist } from '@/components/work-order-checklist';
import { WorkOrderComments } from '@/components/work-order-comments';
import { apiFetch, apiFileUrl, ApiError } from '@/lib/api';
import { BRL, formatDateTime } from '@/lib/format';
import { labelFor, statusLabels } from '@/lib/labels';
import type {
  ClosureReadiness,
  CurrentSession,
  TenantDirectoryMember,
  WorkOrder,
  WorkOrderChecklistItem,
  WorkOrderComment,
  WorkOrderStatus,
} from '@/lib/types';

type Section = 'summary' | 'execution' | 'activity' | 'documents';
type Attachment = { id: string; kind: string; originalName: string; mimeType: string; sizeBytes: string; createdAt: string };
type Pendency = { id: string; reason: string; status: string; dueAt?: string | null; createdAt: string; resolvedAt?: string | null; resolution?: string | null };
type StatusHistory = { id: string; fromStatus?: string | null; toStatus: string; note?: string | null; changedAt: string; changedBy: { id: string; name: string } };
type Reopening = { id: string; reason: string; within30Days: boolean; reopenedAt: string; previousStatus: string; reopenedBy: { id: string; name: string } };
type DetailedWorkOrder = Omit<WorkOrder, 'pendencies'> & {
  openedAt: string;
  completedAt?: string | null;
  closedAt?: string | null;
  acceptedAt?: string | null;
  acceptedBy?: { id: string; name: string; email?: string } | null;
  acceptanceNote?: string | null;
  slaResponseDeadline?: string | null;
  slaResolutionDeadline?: string | null;
  estimatedCost?: string | number | null;
  approvedCost?: string | number | null;
  finalCost?: string | number | null;
  attachments: Attachment[];
  pendencies: Pendency[];
  statusHistory: StatusHistory[];
  comments: WorkOrderComment[];
  checklistItems: WorkOrderChecklistItem[];
  reopenings: Reopening[];
  closeReadiness: ClosureReadiness;
  budgets?: Array<{ id: string; stage: string; status: string; total: string | number; items: unknown[] }>;
  satisfaction?: { score: number; npsScore?: number | null; comment?: string | null } | null;
};

const OPERATIONAL_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'CONTRACT_MANAGER', 'CONTRACT_INSPECTOR']);
const ACCEPTANCE_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'CONTRACT_MANAGER', 'CONTRACT_INSPECTOR']);
const COMMENT_ROLES = new Set([...OPERATIONAL_ROLES, 'REQUESTER']);
const GENERIC_TRANSITIONS: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
  OPEN: ['TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'CANCELED'],
  TRIAGED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['WAITING_APPROVAL', 'CANCELED'],
  WAITING_APPROVAL: ['IN_PROGRESS', 'CANCELED'],
};
const ATTACHMENT_OPTIONS = [
  ['PHOTO_BEFORE', 'Foto antes'], ['PHOTO_DURING', 'Foto durante'], ['PHOTO_AFTER', 'Foto depois'],
  ['INVOICE_PDF', 'Nota fiscal em PDF'], ['TECHNICAL_REPORT', 'Relatório técnico'],
  ['QUOTATION', 'Orçamento/cotação'], ['OTHER_DOCUMENT', 'Outro documento'],
];

const INITIAL_CLOSE_READINESS: ClosureReadiness = {
  ready: false,
  blockers: ['Aguardando a avaliação dos critérios de fechamento.'],
  checks: {},
};

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof window === 'undefined' ? params.id : new URLSearchParams(window.location.search).get('id') || params.id;
  const [section, setSectionState] = useState<Section>(() => {
    if (typeof window === 'undefined') return 'summary';
    const value = new URLSearchParams(window.location.search).get('section');
    return value === 'execution' || value === 'activity' || value === 'documents' ? value : 'summary';
  });
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [workOrder, setWorkOrder] = useState<DetailedWorkOrder | null>(null);
  const [directory, setDirectory] = useState<TenantDirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [transitionStatus, setTransitionStatus] = useState<WorkOrderStatus | ''>('');
  const [transitionNote, setTransitionNote] = useState('');
  const [solution, setSolution] = useState('');
  const [finalCost, setFinalCost] = useState('');
  const [measurementEligible, setMeasurementEligible] = useState(false);
  const [acceptanceNote, setAcceptanceNote] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [pendencyReason, setPendencyReason] = useState('');
  const [pendencyDueAt, setPendencyDueAt] = useState('');
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [attachmentKind, setAttachmentKind] = useState('PHOTO_BEFORE');
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    locationDetail: '',
    priority: 'NORMAL',
    dueAt: '',
    assignedToUserId: '',
  });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<DetailedWorkOrder>(`/work-orders/${id}`);
      setWorkOrder({
        ...data,
        comments: data.comments ?? [],
        checklistItems: data.checklistItems ?? [],
        reopenings: data.reopenings ?? [],
        closeReadiness: data.closeReadiness ?? INITIAL_CLOSE_READINESS,
      });
      setSolution(data.solution ?? '');
      setFinalCost(data.finalCost == null ? '' : String(data.finalCost));
      setMeasurementEligible(data.measurementEligible ?? false);
      setAcceptanceNote(data.acceptanceNote ?? '');
      setEditForm({ title: data.title, description: data.description, locationDetail: data.locationDetail ?? '',
        priority: data.priority, dueAt: data.dueAt?.slice(0, 16) ?? '',
        assignedToUserId: data.assignedTo?.id ?? '' });
      const next = (GENERIC_TRANSITIONS[data.status as WorkOrderStatus] ?? [])[0] ?? '';
      setTransitionStatus(next);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a ordem de serviço.');
    } finally { setLoading(false); }
  }, [id]);

  // The query-string id is resolved only after this static page hydrates in the browser.
  useEffect(() => { void Promise.all([
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(),
    apiFetch<CurrentSession>('/auth/me').then(setSession),
    apiFetch<TenantDirectoryMember[]>('/members/directory').then(setDirectory).catch(() => setDirectory([])),
  ]); }, [load]);

  function setSection(next: Section) {
    setSectionState(next);
    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search);
      query.set('id', id);
      query.set('section', next);
      window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
    }
  }

  async function run(action: string, operation: () => Promise<unknown>, message?: string) {
    setBusyAction(action); setError(''); setSuccess('');
    try { await operation(); if (message) setSuccess(message); await load(); }
    catch (cause) { setError(apiErrorMessage(cause)); }
    finally { setBusyAction(null); }
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    void run('edit', async () => {
      await apiFetch(`/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify({ ...editForm,
        locationDetail: editForm.locationDetail || undefined,
        assignedToUserId: editForm.assignedToUserId || undefined,
        dueAt: editForm.dueAt ? new Date(editForm.dueAt).toISOString() : undefined }) });
      setEditing(false);
    }, 'Ordem de serviço atualizada.');
  }

  function archiveWorkOrder() {
    if (!window.confirm(`Excluir a OS ${workOrder?.number}? O histórico e os vínculos financeiros serão preservados para auditoria.`)) return;
    void run('delete', async () => {
      await apiFetch(`/work-orders/${id}`, { method: 'DELETE' });
      window.location.assign('/ordens-servico');
    });
  }

  function transition(event: FormEvent) {
    event.preventDefault(); if (!transitionStatus) return;
    void run('transition', () => apiFetch(`/work-orders/${id}/transitions`, { method: 'POST', body: JSON.stringify({ toStatus: transitionStatus, note: transitionNote || undefined }) }), 'Etapa da OS atualizada.');
  }
  function complete(event: FormEvent) {
    event.preventDefault();
    void run('complete', () => apiFetch(`/work-orders/${id}/transitions`, { method: 'POST', body: JSON.stringify({ toStatus: 'COMPLETED', solution }) }), 'Execução concluída e enviada para aceite.');
  }
  function close(event: FormEvent) {
    event.preventDefault();
    const parsedFinalCost = finalCost ? Number(finalCost) : undefined;
    if (parsedFinalCost !== undefined && (!Number.isFinite(parsedFinalCost) || parsedFinalCost <= 0)) {
      setError('O custo final, quando informado, deve ser maior que zero.');
      return;
    }
    void run('close', () => apiFetch(`/work-orders/${id}/close`, { method: 'POST', body: JSON.stringify({ finalCost: parsedFinalCost, measurementEligible, acceptanceNote: acceptanceNote || undefined }) }), 'Serviço aceito e ordem fechada.');
  }
  function reopen(event: FormEvent) {
    event.preventDefault();
    void run('reopen', async () => { await apiFetch(`/work-orders/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason: reopenReason }) }); setReopenReason(''); }, 'Ordem reaberta com novo ciclo de SLA.');
  }
  function addPendency(event: FormEvent) {
    event.preventDefault();
    void run('pendency', async () => { await apiFetch(`/work-orders/${id}/pendencies`, { method: 'POST', body: JSON.stringify({ reason: pendencyReason, dueAt: pendencyDueAt ? new Date(pendencyDueAt).toISOString() : undefined }) }); setPendencyReason(''); setPendencyDueAt(''); }, 'Pendência registrada.');
  }
  function resolvePendency(pendencyId: string) {
    const text = resolution[pendencyId]?.trim(); if (!text) return;
    void run(`resolve:${pendencyId}`, async () => { await apiFetch(`/work-orders/${id}/pendencies/${pendencyId}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolution: text }) }); setResolution((current) => ({ ...current, [pendencyId]: '' })); }, 'Pendência resolvida.');
  }
  function upload(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    void run('upload', async () => { const body = new FormData(); body.append('kind', attachmentKind); body.append('file', file); await apiFetch(`/work-orders/${id}/attachments`, { method: 'POST', body }); setFile(null); const input = document.getElementById('attachmentFile') as HTMLInputElement | null; if (input) input.value = ''; }, 'Arquivo anexado.');
  }
  async function addComment(body: string, mentionUserIds: string[]) {
    await run('comment', () => apiFetch(`/work-orders/${id}/comments`, { method: 'POST', body: JSON.stringify({ body, mentionUserIds: mentionUserIds.length ? mentionUserIds : undefined }) }), 'Comentário publicado.');
  }
  async function respondChecklist(itemId: string, checked: boolean, note?: string) {
    await run(`checklist:${itemId}`, () => apiFetch(`/work-orders/${id}/checklist/${itemId}/responses`, { method: 'POST', body: JSON.stringify({ checked, note }) }), 'Resposta de checklist registrada.');
  }

  if (loading && !workOrder) return <LoadingPanel label="Carregando a ordem de serviço…" />;
  if (!workOrder) return <div className="page-container"><div className="notice error">{error || 'Ordem de serviço não encontrada.'}</div></div>;

  const operational = Boolean(session && OPERATIONAL_ROLES.has(session.role));
  const canAccept = Boolean(session && ACCEPTANCE_ROLES.has(session.role));
  const canComment = Boolean(session && COMMENT_ROLES.has(session.role));
  const openPendencies = workOrder.pendencies.filter((item) => item.status === 'OPEN');
  const genericTransitions = workOrder.hasOpenPendency ? [] : GENERIC_TRANSITIONS[workOrder.status as WorkOrderStatus] ?? [];
  const canAddPendency = operational && ['OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'WAITING_APPROVAL'].includes(workOrder.status);
  const allowedAttachments = session?.role === 'REQUESTER' ? ATTACHMENT_OPTIONS.filter(([kind]) => ['PHOTO_BEFORE', 'OTHER_DOCUMENT'].includes(kind)) : ATTACHMENT_OPTIONS;
  const mentionableUsers = [
    workOrder.requester,
    workOrder.assignedTo,
    ...directory
      .filter((membership) => session?.role !== 'REQUESTER' || membership.role !== 'REQUESTER' || membership.user.id === workOrder.requester.id)
      .map((membership) => membership.user),
    ...workOrder.comments.map((comment) => comment.author),
    ...workOrder.comments.flatMap((comment) => comment.mentions.map((mention) => mention.user)),
  ].filter((user): user is NonNullable<typeof user> => Boolean(user && user.id !== session?.user.id));
  const overdue = workOrder.slaResolutionDeadline ? new Date(workOrder.slaResolutionDeadline) < new Date() && !['COMPLETED', 'CLOSED', 'CANCELED'].includes(workOrder.status) : false;
  const closureDraftPending = workOrder.status === 'COMPLETED' && (
    normalizeNumericDraft(finalCost) !== normalizeNumericDraft(workOrder.finalCost) ||
    measurementEligible !== Boolean(workOrder.measurementEligible) ||
    acceptanceNote.trim() !== (workOrder.acceptanceNote ?? '').trim()
  );

  return <div className="page-container work-order-detail-page">
    <header className="page-header"><div className="page-title"><div className="actions work-order-badges"><StatusBadge value={workOrder.status} /><PriorityBadge value={workOrder.priority} />{workOrder.hasOpenPendency ? <span className="badge warning"><AlertTriangle size={13} /> pendência aberta</span> : null}{overdue ? <span className="badge danger"><Clock3 size={13} /> SLA vencido</span> : null}{workOrder.reopenCount ? <span className="badge warning"><RotateCcw size={13} /> {workOrder.reopenCount} reabertura(s)</span> : null}</div><h1>{workOrder.number} — {workOrder.title}</h1><p>{workOrder.description}</p></div><div className="actions"><Link className="btn btn-primary" href={`/orcamentos?workOrderId=${id}`}><Calculator size={16} /> Incluir orçamento</Link>{operational ? <button className="btn btn-secondary" type="button" onClick={() => setEditing((value) => !value)}>{editing ? <X size={16} /> : <Pencil size={16} />} {editing ? 'Fechar edição' : 'Editar'}</button> : null}{operational ? <button className="btn btn-secondary danger-text" type="button" disabled={busyAction === 'delete'} onClick={archiveWorkOrder}><Trash2 size={16} /> Excluir</button> : null}<a className="btn btn-secondary" href={apiFileUrl(`/reports/work-orders/${id}.pdf`)} target="_blank" rel="noreferrer"><Download size={16} /> Ficha PDF</a><button className="btn btn-secondary" type="button" onClick={() => void load()}><RefreshCw size={16} /> Atualizar</button><Link className="btn btn-secondary" href="/ordens-servico"><ArrowLeft size={16} /> Voltar</Link></div></header>
    {error ? <div className="notice error page-notice">{error}</div> : null}
    {success ? <div className="notice success page-notice">{success}</div> : null}

    {editing ? <form className="card form-card" onSubmit={saveEdit} style={{ marginBottom: 18 }}><section className="form-section"><div className="form-section-header"><h2>Editar dados da ordem</h2><p>Alterações ficam registradas na auditoria da OS.</p></div><div className="form-grid"><div className="field col-8"><label>Título</label><input className="input" required value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></div><div className="field col-2"><label>Prioridade</label><select className="select" value={editForm.priority} onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option><option value="CRITICAL">Crítica</option></select></div><div className="field col-2"><label>Prazo</label><input className="input" type="datetime-local" value={editForm.dueAt} onChange={(event) => setEditForm({ ...editForm, dueAt: event.target.value })} /></div><div className="field col-4"><label>Responsável operacional</label><select className="select" value={editForm.assignedToUserId} onChange={(event) => setEditForm({ ...editForm, assignedToUserId: event.target.value })}><option value="">Não atribuído</option>{directory.filter((membership) => OPERATIONAL_ROLES.has(membership.role)).map((membership) => <option key={membership.user.id} value={membership.user.id}>{membership.user.name} — {membership.user.email}</option>)}</select></div><div className="field col-4"><label>Local</label><input className="input" value={editForm.locationDetail} onChange={(event) => setEditForm({ ...editForm, locationDetail: event.target.value })} /></div><div className="field col-8"><label>Descrição</label><textarea className="textarea" required value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></div></div></section><div className="form-footer"><button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>Cancelar</button><button className="btn btn-primary" disabled={busyAction === 'edit'}><Save size={16} /> Salvar alterações</button></div></form> : null}

    <div className="page-tabs work-order-tabs" role="tablist" aria-label="Detalhes da ordem de serviço">
      <SectionTab active={section === 'summary'} icon={FileText} label="Resumo" onClick={() => setSection('summary')} />
      <SectionTab active={section === 'execution'} icon={ClipboardCheck} label="Execução" badge={`${workOrder.checklistItems.filter((item) => item.responses[0]?.checked).length}/${workOrder.checklistItems.length}`} onClick={() => setSection('execution')} />
      <SectionTab active={section === 'activity'} icon={MessageSquareText} label="Atividade" badge={String(workOrder.comments.length)} onClick={() => setSection('activity')} />
      <SectionTab active={section === 'documents'} icon={Paperclip} label="Documentos" badge={String(workOrder.attachments.length)} onClick={() => setSection('documents')} />
    </div>

    <div className="detail-grid">
      <div className="grid">
        {section === 'summary' ? <>
          <section className="card"><div className="card-header"><div><h2>Dados da demanda</h2><p>Classificação, responsáveis, contratação, prazo e custos.</p></div></div><div className="card-body detail-list">
            <Detail icon={MapPin} label="Edificação" value={`${workOrder.building.code} — ${workOrder.building.name}`} note={workOrder.locationDetail || undefined} />
            <Detail icon={Wrench} label="Classificação" value={workOrder.category?.name ?? 'Não definida'} note={[workOrder.specialty?.name, workOrder.environment?.name, workOrder.cause?.name].filter(Boolean).join(' · ') || undefined} />
            <Detail icon={UserRound} label="Demandante" value={workOrder.requester.name} note={workOrder.requester.email} />
            <Detail icon={UserRound} label="Responsável operacional" value={workOrder.assignedTo?.name ?? 'Não atribuído'} note={workOrder.assignedTo?.email} />
            <Detail icon={FileText} label="Contrato principal" value={workOrder.contracts.find((item) => item.isPrimary)?.contract.code || 'Não definido'} note={workOrder.contracts.find((item) => item.isPrimary)?.contract.object} />
            <Detail icon={Wrench} label="Fornecedor" value={workOrder.supplier ? workOrder.supplier.tradeName || workOrder.supplier.legalName : 'Não definido'} />
            <Detail icon={CalendarDays} label="Abertura" value={formatDateTime(workOrder.openedAt)} note={`Prazo operacional: ${formatDateTime(workOrder.dueAt)}`} />
            <Detail icon={Clock3} label="SLA de resolução" value={formatDateTime(workOrder.slaResolutionDeadline)} note={`${workOrder.slaPolicy?.name ?? 'Regra registrada na abertura'} · resposta ${formatDateTime(workOrder.slaResponseDeadline)}`} />
            <Detail icon={FileText} label="Custos" value={`Estimado: ${money(workOrder.estimatedCost)}`} note={`Aprovado: ${money(workOrder.approvedCost)} · final: ${money(workOrder.finalCost)}`} />
            <Detail icon={Paperclip} label="Documentação" value={`${workOrder.attachments.length} anexo(s)`} note={`${workOrder.statusHistory.length} evento(s) de status`} />
          </div></section>
          <section className="card"><div className="card-header"><div><h2>Pendências</h2><p>Impedimentos formais pausam a execução conforme a política de SLA.</p></div><span className={`badge ${openPendencies.length ? 'warning' : 'success'}`}>{openPendencies.length} aberta(s)</span></div><div className="card-body">
            {openPendencies.map((pendency) => <div className="pendency-item" key={pendency.id}><strong>{pendency.reason}</strong><span>Criada em {formatDateTime(pendency.createdAt)} · prazo {formatDateTime(pendency.dueAt)}</span>{operational ? <div className="actions"><input className="input" placeholder="Descreva como a pendência foi resolvida" value={resolution[pendency.id] || ''} onChange={(event) => setResolution({ ...resolution, [pendency.id]: event.target.value })} /><button className="btn btn-secondary" type="button" disabled={busyAction === `resolve:${pendency.id}` || !resolution[pendency.id]?.trim()} onClick={() => resolvePendency(pendency.id)}><CheckCircle2 size={16} /> Resolver</button></div> : null}</div>)}
            {!openPendencies.length ? <p className="table-secondary">Não há pendências abertas nesta ordem.</p> : null}
            {canAddPendency ? <form onSubmit={addPendency} className="pendency-form"><div className="form-grid"><div className="field col-8"><label htmlFor="pendencyReason">Nova pendência</label><input className="input" id="pendencyReason" required minLength={3} placeholder="Ex.: aguardando peça, autorização ou acesso" value={pendencyReason} onChange={(event) => setPendencyReason(event.target.value)} /></div><div className="field col-4"><label htmlFor="pendencyDueAt">Prazo de solução</label><input className="input" id="pendencyDueAt" type="datetime-local" value={pendencyDueAt} onChange={(event) => setPendencyDueAt(event.target.value)} /></div></div><button className="btn btn-secondary" disabled={busyAction === 'pendency'}><AlertTriangle size={16} /> Registrar pendência</button></form> : null}
          </div></section>
        </> : null}

        {section === 'execution' ? <>
          <WorkOrderChecklist items={workOrder.checklistItems} canRespond={operational && !['COMPLETED', 'CLOSED', 'CANCELED'].includes(workOrder.status)} busyItemId={busyAction?.startsWith('checklist:') ? busyAction.replace('checklist:', '') : null} onRespond={respondChecklist} />
          <section className="card"><div className="card-header"><div><h2>Conclusão e aceite</h2><p>Registro consolidado da solução, qualidade, custo e elegibilidade contratual.</p></div><CheckCircle2 size={19} /></div><div className="card-body detail-list"><Detail icon={Wrench} label="Solução executada" value={workOrder.solution || 'Ainda não informada'} /><Detail icon={CheckCircle2} label="Aceite" value={workOrder.acceptedBy?.name ?? 'Ainda não registrado'} note={workOrder.acceptedAt ? formatDateTime(workOrder.acceptedAt) : undefined} /><Detail icon={FileText} label="Custo final" value={money(workOrder.finalCost)} /><Detail icon={ClipboardCheck} label="Medição" value={workOrder.measurementEligible ? 'Elegível para medição' : 'Não elegível'} /></div>{workOrder.acceptanceNote ? <div className="acceptance-note"><strong>Observação do aceite</strong><p>{workOrder.acceptanceNote}</p></div> : null}</section>
        </> : null}

        {section === 'activity' ? <>
          <WorkOrderComments comments={workOrder.comments} mentionableUsers={mentionableUsers} canComment={canComment} busy={busyAction === 'comment'} onSubmit={addComment} />
          <section className="card"><div className="card-header"><div><h2>Histórico da OS</h2><p>Trilha cronológica de status e reaberturas.</p></div><History size={19} /></div><div className="card-body"><div className="timeline">{workOrder.statusHistory.map((item) => <div className="timeline-item" key={item.id}><strong>{labelFor(item.toStatus, statusLabels)}</strong><span>{item.changedBy.name} · {formatDateTime(item.changedAt)}</span>{item.note ? <span>{item.note}</span> : null}</div>)}</div>{workOrder.reopenings.length ? <div className="reopening-history"><h3>Reaberturas</h3>{workOrder.reopenings.map((item) => <div key={item.id}><RotateCcw size={16} /><span><strong>{item.reason}</strong><small>{item.reopenedBy.name} · {formatDateTime(item.reopenedAt)}{item.within30Days ? ' · em até 30 dias' : ''}</small></span></div>)}</div> : null}</div></section>
        </> : null}

        {section === 'documents' ? <section className="card"><div className="card-header"><div><h2>Fotos, notas fiscais e documentos</h2><p>Evidências privadas vinculadas à ordem de serviço.</p></div><Paperclip size={19} /></div><div className="card-body"><div className="evidence-summary">{['PHOTO_BEFORE', 'PHOTO_DURING', 'PHOTO_AFTER'].map((kind) => <div key={kind}><span className={`badge ${workOrder.attachments.some((item) => item.kind === kind) ? 'success' : 'neutral'}`}>{workOrder.attachments.filter((item) => item.kind === kind).length}</span><span>{kind === 'PHOTO_BEFORE' ? 'Antes' : kind === 'PHOTO_DURING' ? 'Durante' : 'Depois'}</span></div>)}</div><div className="table-wrapper"><table className="data-table"><thead><tr><th>Documento</th><th>Tipo</th><th>Data</th><th></th></tr></thead><tbody>{workOrder.attachments.map((attachment) => <tr key={attachment.id}><td><span className="table-primary">{attachment.originalName}</span><span className="table-secondary">{attachment.mimeType} · {Math.max(1, Math.round(Number(attachment.sizeBytes) / 1024))} KB</span></td><td><span className="badge neutral">{attachmentLabel(attachment.kind)}</span></td><td>{formatDateTime(attachment.createdAt)}</td><td><a className="btn btn-ghost" href={apiFileUrl(`/work-orders/${id}/attachments/${attachment.id}/download`)}><Download size={15} /> Baixar</a></td></tr>)}{!workOrder.attachments.length ? <tr><td colSpan={4}>Ainda não há anexos.</td></tr> : null}</tbody></table></div>{session?.role !== 'AUDITOR' && !['CLOSED', 'CANCELED'].includes(workOrder.status) ? <form onSubmit={upload} className="form-grid attachment-form"><div className="field col-4"><label htmlFor="attachmentKind">Classificação</label><select className="select" id="attachmentKind" value={attachmentKind} onChange={(event) => setAttachmentKind(event.target.value)}>{allowedAttachments.map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}</select></div><div className="field col-6"><label htmlFor="attachmentFile">Arquivo</label><input className="input" id="attachmentFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></div><div className="field col-2"><label>&nbsp;</label><button className="btn btn-secondary" disabled={busyAction === 'upload' || !file}><Upload size={16} /> Enviar</button></div></form> : null}</div></section> : null}
      </div>

      <aside className="grid work-order-sidebar">
        <WorkOrderActions workOrder={workOrder} operational={operational} canAccept={canAccept} genericTransitions={genericTransitions} transitionStatus={transitionStatus} setTransitionStatus={setTransitionStatus} transitionNote={transitionNote} setTransitionNote={setTransitionNote} solution={solution} setSolution={setSolution} finalCost={finalCost} setFinalCost={setFinalCost} measurementEligible={measurementEligible} setMeasurementEligible={setMeasurementEligible} acceptanceNote={acceptanceNote} setAcceptanceNote={setAcceptanceNote} reopenReason={reopenReason} setReopenReason={setReopenReason} busyAction={busyAction} transition={transition} complete={complete} close={close} reopen={reopen} />
        <ReadinessCard readiness={workOrder.closeReadiness} status={workOrder.status} draftPending={closureDraftPending} onNavigate={setSection} />
        <section className={`card sla-status-card ${overdue ? 'overdue' : ''}`}><div className="card-header"><div><h3>SLA da OS</h3><p>Snapshot da regra aplicada.</p></div><Clock3 size={19} /></div><div className="card-body"><strong>{overdue ? 'Prazo vencido' : ['COMPLETED', 'CLOSED'].includes(workOrder.status) ? 'Execução concluída' : 'Em acompanhamento'}</strong><span>Resposta: {formatDateTime(workOrder.slaResponseDeadline)}</span><span>Resolução: {formatDateTime(workOrder.slaResolutionDeadline)}</span><span>{workOrder.slaPolicy?.name ?? 'Política preservada no snapshot'}</span></div></section>
      </aside>
    </div>
  </div>;
}

function SectionTab({ active, icon: Icon, label, badge, onClick }: { active: boolean; icon: typeof FileText; label: string; badge?: string; onClick: () => void }) { return <button className={active ? 'active' : ''} role="tab" aria-selected={active} type="button" onClick={onClick}><Icon size={16} /> {label}{badge ? <span className="badge neutral">{badge}</span> : null}</button>; }

function WorkOrderActions({ workOrder, operational, canAccept, genericTransitions, transitionStatus, setTransitionStatus, transitionNote, setTransitionNote, solution, setSolution, finalCost, setFinalCost, measurementEligible, setMeasurementEligible, acceptanceNote, setAcceptanceNote, reopenReason, setReopenReason, busyAction, transition, complete, close, reopen }: {
  workOrder: DetailedWorkOrder; operational: boolean; canAccept: boolean; genericTransitions: WorkOrderStatus[]; transitionStatus: WorkOrderStatus | ''; setTransitionStatus: (value: WorkOrderStatus | '') => void; transitionNote: string; setTransitionNote: (value: string) => void; solution: string; setSolution: (value: string) => void; finalCost: string; setFinalCost: (value: string) => void; measurementEligible: boolean; setMeasurementEligible: (value: boolean) => void; acceptanceNote: string; setAcceptanceNote: (value: string) => void; reopenReason: string; setReopenReason: (value: string) => void; busyAction: string | null; transition: (event: FormEvent) => void; complete: (event: FormEvent) => void; close: (event: FormEvent) => void; reopen: (event: FormEvent) => void;
}) {
  if (!operational) return <section className="card"><div className="card-header"><div><h3>Ações da OS</h3><p>Seu perfil possui acesso de consulta e participação.</p></div></div><div className="card-body"><div className="notice">As ações operacionais são restritas à equipe responsável.</div></div></section>;
  return <section className="card work-order-actions"><div className="card-header"><div><h3>Ações da OS</h3><p>Fluxos explícitos e auditáveis.</p></div><PlayCircle size={19} /></div><div className="card-body">
    {genericTransitions.length ? <form className="action-form" onSubmit={transition}><div className="field"><label htmlFor="transitionStatus">Alterar etapa</label><select className="select" id="transitionStatus" value={transitionStatus} onChange={(event) => setTransitionStatus(event.target.value as WorkOrderStatus)}>{genericTransitions.map((status) => <option key={status} value={status}>{labelFor(status, statusLabels)}</option>)}</select></div><div className="field"><label htmlFor="transitionNote">Observação</label><textarea className="textarea compact" id="transitionNote" value={transitionNote} onChange={(event) => setTransitionNote(event.target.value)} placeholder="Contexto da movimentação" /></div><button className="btn btn-secondary" disabled={busyAction === 'transition'}>{busyAction === 'transition' ? 'Processando…' : 'Confirmar etapa'}</button></form> : null}
    {['IN_PROGRESS', 'WAITING_APPROVAL'].includes(workOrder.status) && !workOrder.hasOpenPendency ? <form className="action-form emphasized" onSubmit={complete}><div><strong>Concluir execução</strong><span>Checklist e evidências serão validados pelo servidor.</span></div><div className="field"><label htmlFor="solution">Solução executada *</label><textarea className="textarea" id="solution" required minLength={3} value={solution} onChange={(event) => setSolution(event.target.value)} placeholder="Descreva o diagnóstico, a intervenção e o resultado." /></div><button className="btn btn-primary" disabled={busyAction === 'complete' || !solution.trim()}><Send size={16} /> {busyAction === 'complete' ? 'Validando…' : 'Concluir e enviar para aceite'}</button></form> : null}
    {workOrder.status === 'COMPLETED' && canAccept ? <form className="action-form emphasized" onSubmit={close}><div><strong>Aceitar e fechar</strong><span>O usuário atual será registrado como responsável pelo aceite.</span></div><div className="field"><label htmlFor="finalCost">Custo final (R$)</label><input className="input" id="finalCost" type="number" min="0.01" step="0.01" value={finalCost} onChange={(event) => setFinalCost(event.target.value)} /></div><label className="checkbox-field"><input type="checkbox" checked={measurementEligible} onChange={(event) => setMeasurementEligible(event.target.checked)} /><span><strong>Solicitar elegibilidade para medição contratual</strong><small>O servidor validará contrato principal vigente, custo aprovado suficiente, documentação obrigatória e ausência em medição ativa.</small></span></label><div className="field"><label htmlFor="acceptanceNote">Observação do aceite</label><textarea className="textarea compact" id="acceptanceNote" value={acceptanceNote} onChange={(event) => setAcceptanceNote(event.target.value)} placeholder="Resultado da vistoria ou justificativa" /></div><button className="btn btn-primary" disabled={busyAction === 'close' || Boolean(finalCost && Number(finalCost) <= 0)}><CheckCircle2 size={16} /> {busyAction === 'close' ? 'Fechando…' : 'Aceitar e fechar OS'}</button></form> : null}
    {['COMPLETED', 'CLOSED'].includes(workOrder.status) && canAccept ? <form className="action-form danger-zone" onSubmit={reopen}><div><strong>Reabrir ordem</strong><span>Cria evento explícito, incrementa o contador e inicia novo SLA.</span></div><div className="field"><label htmlFor="reopenReason">Motivo da reabertura *</label><textarea className="textarea compact" id="reopenReason" required minLength={10} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Descreva a recorrência ou a não conformidade identificada." /></div><button className="btn btn-secondary" disabled={busyAction === 'reopen' || reopenReason.trim().length < 10}><RotateCcw size={16} /> {busyAction === 'reopen' ? 'Reabrindo…' : 'Reabrir para execução'}</button></form> : null}
    {['COMPLETED', 'CLOSED'].includes(workOrder.status) && !canAccept ? <div className="notice">O aceite, fechamento e reabertura são restritos aos perfis de gestão e fiscalização contratual.</div> : null}
    {workOrder.status === 'PENDING' ? <div className="notice warning">Resolva todas as pendências para restaurar a etapa anterior.</div> : null}
    {workOrder.status === 'CANCELED' ? <div className="notice">Esta OS foi cancelada e não admite novas ações.</div> : null}
  </div></section>;
}

function ReadinessCard({ readiness, status, draftPending, onNavigate }: { readiness: ClosureReadiness; status: string; draftPending: boolean; onNavigate: (section: Section) => void }) {
  const checks = Object.entries(readiness.checks);
  return <section className="card readiness-card"><div className="card-header"><div><h3>Prontidão para fechamento</h3><p>Critérios avaliados no servidor.</p></div><span className={`badge ${!draftPending && readiness.ready ? 'success' : 'warning'}`}>{draftPending ? 'reavaliação pendente' : readiness.ready ? 'pronta' : `${readiness.blockers.length} pendência(s)`}</span></div><div className="card-body">{draftPending ? <div className="notice warning readiness-draft-notice">O cartão abaixo reflete o estado salvo. Custo, aceite e elegibilidade alterados no formulário serão reavaliados ao fechar.</div> : null}{checks.length ? <div className="readiness-checks">{checks.map(([key, met]) => { const metadata = readinessCheckMetadata(key); return <button type="button" key={key} onClick={() => onNavigate(metadata.section)}><span className={met ? 'met' : 'missing'}>{met ? <Check size={13} /> : '!'}</span><span>{metadata.label}</span></button>; })}</div> : null}{readiness.blockers.length ? <details className="readiness-blockers" open={status === 'COMPLETED'}><summary>Ver bloqueios</summary><ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></details> : <div className="notice success"><CheckCircle2 size={16} /> Todos os critérios do estado salvo foram atendidos.</div>}{status === 'COMPLETED' ? <p className="readiness-hint">Os dados do formulário ao lado são reavaliados pelo servidor no momento do fechamento.</p> : null}</div></section>;
}

function readinessCheckMetadata(key: string): { label: string; section: Section } {
  const metadata: Record<string, { label: string; section: Section }> = {
    statusCompleted: { label: 'Execução concluída', section: 'execution' },
    noOpenPendency: { label: 'Sem pendência aberta', section: 'summary' },
    solutionProvided: { label: 'Solução registrada', section: 'execution' },
    finalCostProvided: { label: 'Custo final informado', section: 'execution' },
    acceptanceRecorded: { label: 'Responsável pelo aceite', section: 'execution' },
    primaryContractLinked: { label: 'Contrato principal vinculado', section: 'summary' },
    contractEligible: { label: 'Contrato principal vigente e elegível', section: 'summary' },
    costApproved: { label: 'Custo final coberto pelo valor aprovado', section: 'execution' },
    notAlreadyMeasured: { label: 'OS fora de outra medição ativa', section: 'summary' },
    primaryContractEligible: { label: 'Contrato principal apto à medição', section: 'summary' },
    primaryContractActive: { label: 'Contrato ativo ou em vencimento', section: 'summary' },
    primaryContractCurrent: { label: 'Contrato vigente na data do fechamento', section: 'summary' },
    approvedCostCoversFinalCost: { label: 'Custo aprovado cobre o custo final', section: 'execution' },
    requiredDocumentationProvided: { label: 'Documentação obrigatória anexada', section: 'documents' },
    notInActiveMeasurement: { label: 'OS fora de outra medição ativa', section: 'summary' },
  };
  return metadata[key] ?? { label: humanizeCheckKey(key), section: key.toLowerCase().includes('document') ? 'documents' : 'execution' };
}

function humanizeCheckKey(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function normalizeNumericDraft(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(value);
}

function Detail({ icon: Icon, label, value, note }: { icon: typeof MapPin; label: string; value: string; note?: string }) { return <div className="detail-item"><span className="detail-label"><Icon size={14} /> {label}</span><strong>{value}</strong>{note ? <span>{note}</span> : null}</div>; }
function money(value?: string | number | null): string { return value == null || value === '' ? '—' : BRL.format(Number(value)); }
function attachmentLabel(kind: string): string { return ATTACHMENT_OPTIONS.find(([value]) => value === kind)?.[1] ?? kind.replaceAll('_', ' ').toLowerCase(); }
function apiErrorMessage(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'A operação não pôde ser concluída.';
  const details = cause.details;
  if (details && typeof details === 'object' && 'blockers' in details && Array.isArray(details.blockers)) return `${cause.message} ${details.blockers.join(' ')}`;
  return cause.message;
}

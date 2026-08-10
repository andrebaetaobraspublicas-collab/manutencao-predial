'use client';

import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  Download,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BuildingLocationPicker } from '@/components/building-location-picker';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiDownload, apiFetch, ApiError } from '@/lib/api';
import type {
  Building,
  BuildingAttachmentKind,
  BuildingLocationConfirmation,
  CurrentSession,
} from '@/lib/types';

const EMPTY_FORM = {
  code: '',
  name: '',
  type: '',
  addressLine1: '',
  addressLine2: '',
  district: '',
  city: '',
  state: '',
  postalCode: '',
  grossAreaM2: '',
  constructionYear: '',
  floors: '',
};

const EMPTY_INSPECTION = {
  inspectionDate: new Date().toISOString().slice(0, 10),
  type: 'PREVENTIVE',
  responsibleTechnician: '',
  team: '',
  notes: '',
};

const INSPECTION_LABELS: Record<string, string> = {
  PREVENTIVE: 'Preventiva',
  PERIODIC: 'Periódica',
  EXTRAORDINARY: 'Extraordinária',
  RECEIPT: 'Recebimento',
  OTHER: 'Outra',
};

const FREQUENCY_LABELS: Record<string, string> = {
  DAY: 'dia(s)',
  WEEK: 'semana(s)',
  MONTH: 'mês(es)',
  QUARTER: 'trimestre(s)',
  SEMESTER: 'semestre(s)',
  YEAR: 'ano(s)',
  METER_READING: 'leitura(s)',
};

type BuildingForm = typeof EMPTY_FORM;
type InspectionForm = typeof EMPTY_INSPECTION;

type DeletionImpact = {
  building: { id: string; code: string; name: string };
  counts: {
    contracts: number;
    workOrders: number;
    maintenancePlans: number;
    assets: number;
    attachments: number;
    inspections: number;
    openWorkOrders: number;
    activeMaintenancePlans: number;
  };
  warnings: string[];
};

export default function BuildingsPage() {
  const [items, setItems] = useState<Building[]>([]);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Building | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [form, setForm] = useState<BuildingForm>(EMPTY_FORM);
  const [inspectionForm, setInspectionForm] = useState<InspectionForm>(EMPTY_INSPECTION);
  const [location, setLocation] = useState<BuildingLocationConfirmation | null>(null);
  const [locationDirty, setLocationDirty] = useState(false);
  const [initialPoint, setInitialPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationVersion, setLocationVersion] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    Promise.all([apiFetch<Building[]>('/buildings'), apiFetch<CurrentSession>('/auth/me')])
      .then(([buildingItems, sessionData]) => {
        setItems(buildingItems);
        setSession(sessionData);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canManage = Boolean(session && ['OWNER', 'ADMIN', 'MANAGER'].includes(session.role));
  const canArchive = Boolean(session && ['OWNER', 'ADMIN'].includes(session.role));

  function populateForm(building: Building) {
    const hasCoordinates =
      building.latitude !== null &&
      building.latitude !== undefined &&
      building.longitude !== null &&
      building.longitude !== undefined;
    const point = hasCoordinates
      ? { latitude: Number(building.latitude), longitude: Number(building.longitude) }
      : null;
    setForm({
      code: building.code,
      name: building.name,
      type: building.type ?? '',
      addressLine1: building.addressLine1,
      addressLine2: building.addressLine2 ?? '',
      district: building.district ?? '',
      city: building.city,
      state: building.state,
      postalCode: building.postalCode,
      grossAreaM2: building.grossAreaM2 == null ? '' : String(building.grossAreaM2),
      constructionYear: building.constructionYear == null ? '' : String(building.constructionYear),
      floors: building.floors == null ? '' : String(building.floors),
    });
    setInitialPoint(point);
    setLocation(
      point && building.geocodingConfirmed
        ? {
            ...point,
            source:
              building.geocodingSource ??
              (building.geocodingProvider === 'MANUAL'
                ? 'MANUAL'
                : building.geocodingAccuracy === 'MANUAL'
                  ? 'ADJUSTED'
                  : 'PROVIDER'),
            lookupId: building.geocodingLookupId,
            candidateId: building.geocodingCandidateId,
            provider: building.geocodingProvider,
            accuracy: building.geocodingAccuracy,
            placeId: building.geocodingPlaceId,
            adjusted: building.geocodingAccuracy === 'MANUAL',
            confirmedAt:
              building.geocodingConfirmedAt ?? building.geocodedAt ?? new Date().toISOString(),
          }
        : null,
    );
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setDetail(null);
    setForm(EMPTY_FORM);
    setInspectionForm(EMPTY_INSPECTION);
    setLocation(null);
    setLocationDirty(false);
    setInitialPoint(null);
    setLocationVersion((value) => value + 1);
  }

  function openCreate() {
    setError('');
    setSuccess('');
    setEditingId(null);
    setDetail(null);
    setForm(EMPTY_FORM);
    setInspectionForm(EMPTY_INSPECTION);
    setLocation(null);
    setLocationDirty(false);
    setInitialPoint(null);
    setLocationVersion((value) => value + 1);
    setShowForm(true);
  }

  async function openEdit(building: Building) {
    setError('');
    setSuccess('');
    setEditingId(building.id);
    setDetail(building);
    populateForm(building);
    setLocationDirty(false);
    setLocationVersion((value) => value + 1);
    setShowForm(true);
    setDetailLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const buildingDetail = await apiFetch<Building>(`/buildings/${building.id}`);
      setDetail(buildingDetail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o dossiê da edificação.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!editingId) return;
    const buildingDetail = await apiFetch<Building>(`/buildings/${editingId}`);
    setDetail(buildingDetail);
  }

  function updateField<K extends keyof BuildingForm>(
    key: K,
    value: BuildingForm[K],
    affectsAddress = false,
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    if (affectsAddress) {
      setLocation(null);
      setLocationDirty(true);
      setInitialPoint(null);
      setLocationVersion((current) => current + 1);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!location) {
      setError('Confirme a localização no mapa antes de salvar a edificação.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const includeLocation = !editingId || locationDirty;
      const payload = {
        code: form.code,
        name: form.name,
        type: form.type || (editingId ? '' : undefined),
        ...(includeLocation
          ? {
              addressLine1: form.addressLine1,
              addressLine2: form.addressLine2 || (editingId ? '' : undefined),
              district: form.district || (editingId ? '' : undefined),
              city: form.city,
              state: form.state,
              postalCode: form.postalCode,
              country: 'BR',
              latitude: location.latitude,
              longitude: location.longitude,
              geocodingProvider:
                location.provider ?? (location.source === 'MANUAL' ? 'MANUAL' : undefined),
              geocodingAccuracy:
                location.accuracy ?? (location.adjusted ? 'MANUAL' : undefined),
              geocodingPlaceId: location.placeId ?? undefined,
              geocodingLookupId: location.lookupId ?? undefined,
              geocodingCandidateId: location.candidateId ?? undefined,
              geocodingSource: location.source,
              geocodingConfirmed: true,
            }
          : {}),
        grossAreaM2: form.grossAreaM2 ? Number(form.grossAreaM2) : editingId ? null : undefined,
        constructionYear: form.constructionYear
          ? Number(form.constructionYear)
          : editingId
            ? null
            : undefined,
        floors: form.floors ? Number(form.floors) : editingId ? null : undefined,
      };
      await apiFetch(editingId ? `/buildings/${editingId}` : '/buildings', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      const message = editingId
        ? 'Edificação e localização atualizadas.'
        : 'Edificação cadastrada com localização confirmada.';
      closeForm();
      setSuccess(message);
      setLoading(true);
      load();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível salvar a edificação.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function runDetailAction(
    action: string,
    operation: () => Promise<unknown>,
    message: string,
  ) {
    setBusyAction(action);
    setError('');
    setSuccess('');
    try {
      await operation();
      await refreshDetail();
      setSuccess(message);
      load();
      return true;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível concluir a operação.');
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function createInspection() {
    if (!editingId) return;
    const ok = await runDetailAction(
      'inspection',
      () =>
        apiFetch(`/buildings/${editingId}/inspections`, {
          method: 'POST',
          body: JSON.stringify(inspectionForm),
        }),
      'Vistoria cadastrada no histórico da edificação.',
    );
    if (ok) setInspectionForm(EMPTY_INSPECTION);
  }

  async function archiveInspection(inspectionId: string) {
    if (!editingId || !window.confirm('Excluir esta vistoria? O registro será arquivado e a auditoria será preservada.')) return;
    await runDetailAction(
      `inspection-${inspectionId}`,
      () => apiFetch(`/buildings/${editingId}/inspections/${inspectionId}`, { method: 'DELETE' }),
      'Vistoria arquivada.',
    );
  }

  async function uploadAttachment(kind: BuildingAttachmentKind, file: File) {
    if (!editingId) return false;
    return runDetailAction(
      `upload-${kind}`,
      () => {
        const body = new FormData();
        body.append('kind', kind);
        body.append('file', file);
        return apiFetch(`/buildings/${editingId}/attachments`, { method: 'POST', body });
      },
      kind === 'BUILDING_PHOTO' ? 'Fotografia adicionada.' : 'Documento adicionado ao dossiê.',
    );
  }

  async function archiveAttachment(attachmentId: string) {
    if (!editingId || !window.confirm('Excluir este arquivo? O item será ocultado, mantendo a trilha de auditoria.')) return;
    await runDetailAction(
      `attachment-${attachmentId}`,
      () => apiFetch(`/buildings/${editingId}/attachments/${attachmentId}`, { method: 'DELETE' }),
      'Arquivo arquivado.',
    );
  }

  async function downloadAttachment(attachmentId: string, originalName: string) {
    if (!editingId) return;
    setBusyAction(`download-${attachmentId}`);
    setError('');
    try {
      await apiDownload(
        `/buildings/${editingId}/attachments/${attachmentId}/download`,
        originalName,
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível baixar o arquivo.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function archiveBuilding(building: Building) {
    setBusyAction(`building-${building.id}`);
    setError('');
    try {
      const impact = await apiFetch<DeletionImpact>(`/buildings/${building.id}/deletion-impact`);
      const warningText = impact.warnings.length
        ? impact.warnings.map((warning) => `• ${warning}`).join('\n')
        : '• Nenhum contrato, OS ou plano de manutenção foi encontrado.';
      const confirmed = window.confirm(
        `Excluir ${building.code} — ${building.name}?\n\n${warningText}\n\nA exclusão é lógica: os registros históricos serão preservados para auditoria.`,
      );
      if (!confirmed) return;
      await apiFetch(`/buildings/${building.id}`, { method: 'DELETE' });
      if (editingId === building.id) closeForm();
      setSuccess('Edificação arquivada; planos ativos foram suspensos e o histórico foi preservado.');
      setLoading(true);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível excluir a edificação.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>Edificações</h1>
          <p>Cadastro patrimonial, dossiê documental, vistorias e planos de manutenção vinculados.</p>
        </div>
        {canManage ? (
          <button className="btn btn-primary" type="button" onClick={showForm ? closeForm : openCreate}>
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Fechar cadastro' : 'Nova edificação'}
          </button>
        ) : null}
      </header>
      {error ? <div className="notice error page-notice">{error}</div> : null}
      {success ? <div className="notice success page-notice">{success}</div> : null}

      {showForm ? (
        <form className="card form-card building-form" onSubmit={submit}>
          <section className="form-section">
            <div className="form-section-header">
              <h2>{editingId ? 'Editar edificação' : 'Identificação e endereço'}</h2>
              <p>Uma alteração no endereço invalida o ponto anterior e exige nova confirmação.</p>
            </div>
            <div className="form-grid">
              <Field col="col-3" label="Código *"><input className="input" required maxLength={40} value={form.code} onChange={(event) => updateField('code', event.target.value)} /></Field>
              <Field col="col-6" label="Nome *"><input className="input" required minLength={2} value={form.name} onChange={(event) => updateField('name', event.target.value)} /></Field>
              <Field col="col-3" label="Tipo"><input className="input" placeholder="Administrativo, hospital…" value={form.type} onChange={(event) => updateField('type', event.target.value)} /></Field>
              <Field col="col-8" label="Endereço *"><input className="input" required value={form.addressLine1} onChange={(event) => updateField('addressLine1', event.target.value, true)} /></Field>
              <Field col="col-4" label="Complemento"><input className="input" value={form.addressLine2} onChange={(event) => updateField('addressLine2', event.target.value, true)} /></Field>
              <Field col="col-3" label="Bairro"><input className="input" value={form.district} onChange={(event) => updateField('district', event.target.value, true)} /></Field>
              <Field col="col-4" label="Município *"><input className="input" required value={form.city} onChange={(event) => updateField('city', event.target.value, true)} /></Field>
              <Field col="col-2" label="UF *"><input className="input" required minLength={2} maxLength={2} value={form.state} onChange={(event) => updateField('state', event.target.value.toUpperCase(), true)} /></Field>
              <Field col="col-3" label="CEP *"><input className="input" required value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value, true)} /></Field>
            </div>
          </section>

          <section className="form-section">
            <BuildingLocationPicker
              key={locationVersion}
              address={{
                addressLine1: form.addressLine1,
                addressLine2: form.addressLine2,
                district: form.district,
                city: form.city,
                state: form.state,
                postalCode: form.postalCode,
              }}
              initialPoint={initialPoint}
              value={location}
              onChange={(next) => {
                setLocation(next);
                setLocationDirty(true);
              }}
              disabled={submitting}
            />
          </section>

          <section className="form-section">
            <div className="form-section-header"><h2>Características físicas</h2><p>Dados opcionais para indicadores patrimoniais e planejamento.</p></div>
            <div className="form-grid">
              <Field col="col-4" label="Área bruta (m²)"><input className="input" type="number" min="0" step="0.01" value={form.grossAreaM2} onChange={(event) => updateField('grossAreaM2', event.target.value)} /></Field>
              <Field col="col-4" label="Ano de construção"><input className="input" type="number" min="1800" max="2200" value={form.constructionYear} onChange={(event) => updateField('constructionYear', event.target.value)} /></Field>
              <Field col="col-4" label="Pavimentos"><input className="input" type="number" min="1" value={form.floors} onChange={(event) => updateField('floors', event.target.value)} /></Field>
            </div>
          </section>

          {editingId ? (
            detailLoading ? <LoadingPanel /> : <>
              <section className="form-section building-dossier-section">
                <div className="form-section-header">
                  <h2>Dossiê documental e fotografias</h2>
                  <p>Arquivos privados, acessíveis somente por usuários autenticados da organização.</p>
                </div>
                <div className="building-upload-grid">
                  <BuildingUploadField
                    icon={FileCheck2}
                    title="Laudo de inspeção"
                    description="Laudos técnicos e relatórios de vistoria em PDF."
                    accept="application/pdf"
                    kind="INSPECTION_REPORT"
                    busy={busyAction === 'upload-INSPECTION_REPORT'}
                    onUpload={uploadAttachment}
                  />
                  <BuildingUploadField
                    icon={FileText}
                    title="Documentação do Imóvel"
                    description="Plantas, habite-se, certificados e demais documentos em PDF."
                    accept="application/pdf"
                    kind="PROPERTY_DOCUMENT"
                    busy={busyAction === 'upload-PROPERTY_DOCUMENT'}
                    onUpload={uploadAttachment}
                  />
                  <BuildingUploadField
                    icon={ImageIcon}
                    title="Fotos da edificação"
                    description="Fotografias JPG, PNG ou WebP para compor o registro patrimonial."
                    accept="image/jpeg,image/png,image/webp"
                    kind="BUILDING_PHOTO"
                    busy={busyAction === 'upload-BUILDING_PHOTO'}
                    onUpload={uploadAttachment}
                  />
                </div>
                <div className="table-wrapper building-files-table">
                  <table className="data-table">
                    <thead><tr><th>Arquivo</th><th>Classificação</th><th>Enviado por</th><th>Data</th><th>Ações</th></tr></thead>
                    <tbody>
                      {(detail?.attachments ?? []).map((attachment) => <tr key={attachment.id}>
                        <td><span className="table-primary">{attachment.originalName}</span><span className="table-secondary">{attachment.mimeType} · {fileSize(attachment.sizeBytes)}</span></td>
                        <td><span className="badge neutral">{attachmentKindLabel(attachment.kind)}</span></td>
                        <td>{attachment.uploadedBy?.name ?? '—'}</td>
                        <td>{formatDate(attachment.createdAt)}</td>
                        <td><div className="table-actions">
                          <button className="btn btn-ghost" type="button" disabled={busyAction === `download-${attachment.id}`} onClick={() => void downloadAttachment(attachment.id, attachment.originalName)}><Download size={14} /> {busyAction === `download-${attachment.id}` ? 'Baixando…' : 'Baixar'}</button>
                          {canManage ? <button className="btn btn-ghost danger-text" type="button" disabled={busyAction === `attachment-${attachment.id}`} onClick={() => void archiveAttachment(attachment.id)}><Trash2 size={14} /> Excluir</button> : null}
                        </div></td>
                      </tr>)}
                      {!detail?.attachments?.length ? <tr><td colSpan={5}>Nenhum documento ou fotografia cadastrado.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-header building-inspection-heading">
                  <div><h2>Vistorias do imóvel</h2><p>Histórico cronológico e auditável das inspeções realizadas.</p></div>
                  <div className="last-inspection-card"><CalendarCheck size={18} /><span>Data da última vistoria<strong>{formatDate(detail?.lastInspectionAt)}</strong></span></div>
                </div>
                <div className="building-inspection-grid">
                  <div className="subcard">
                    <h3>Nova vistoria</h3>
                    <div className="form-grid">
                      <Field col="col-6" label="Data da vistoria *"><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={inspectionForm.inspectionDate} onChange={(event) => setInspectionForm({ ...inspectionForm, inspectionDate: event.target.value })} /></Field>
                      <Field col="col-6" label="Tipo de vistoria *"><select className="select" value={inspectionForm.type} onChange={(event) => setInspectionForm({ ...inspectionForm, type: event.target.value })}>{Object.entries(INSPECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                      <Field col="col-6" label="Responsável técnico *"><input className="input" maxLength={180} value={inspectionForm.responsibleTechnician} onChange={(event) => setInspectionForm({ ...inspectionForm, responsibleTechnician: event.target.value })} /></Field>
                      <Field col="col-6" label="Equipe"><input className="input" maxLength={220} value={inspectionForm.team} onChange={(event) => setInspectionForm({ ...inspectionForm, team: event.target.value })} /></Field>
                      <Field col="col-12" label="Observações"><textarea className="textarea compact" maxLength={5000} value={inspectionForm.notes} onChange={(event) => setInspectionForm({ ...inspectionForm, notes: event.target.value })} /></Field>
                    </div>
                    <button className="btn btn-primary" type="button" disabled={busyAction === 'inspection' || !inspectionForm.inspectionDate || inspectionForm.responsibleTechnician.trim().length < 2} onClick={() => void createInspection()}><CalendarCheck size={16} /> {busyAction === 'inspection' ? 'Cadastrando…' : 'Cadastrar vistoria'}</button>
                  </div>
                  <div className="subcard">
                    <h3>Vistorias registradas</h3>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead><tr><th>Data</th><th>Tipo</th><th>Responsável</th><th>Equipe</th><th>Ações</th></tr></thead>
                        <tbody>
                          {(detail?.inspections ?? []).map((inspection) => <tr key={inspection.id}>
                            <td>{formatDate(inspection.inspectionDate)}</td>
                            <td><span className="badge neutral">{INSPECTION_LABELS[inspection.type] ?? inspection.type}</span></td>
                            <td><span className="table-primary">{inspection.responsibleTechnician}</span><span className="table-secondary">Registrada por {inspection.createdBy?.name ?? '—'}</span></td>
                            <td>{inspection.team || '—'}</td>
                            <td>{canManage ? <button className="btn btn-ghost danger-text" type="button" disabled={busyAction === `inspection-${inspection.id}`} onClick={() => void archiveInspection(inspection.id)}><Trash2 size={14} /> Excluir</button> : null}</td>
                          </tr>)}
                          {!detail?.inspections?.length ? <tr><td colSpan={5}>Nenhuma vistoria cadastrada.</td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-header maintenance-plan-heading">
                  <div><h2>Plano de manutenção associado</h2><p>Consulta das rotinas cadastradas para esta edificação no módulo Planos de manutenção.</p></div>
                  <Link className="btn btn-secondary" href="/planos-manutencao"><Wrench size={16} /> Abrir planos</Link>
                </div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>Plano</th><th>Ativo</th><th>Recorrência</th><th>Próxima execução</th><th>Contrato / fornecedor</th><th>OS geradas</th><th>Situação</th></tr></thead>
                    <tbody>
                      {(detail?.maintenancePlans ?? []).map((plan) => <tr key={plan.id}>
                        <td><span className="table-primary">{plan.name}</span><span className="table-secondary">{plan.type} {plan.generationSource ? '· plano inteligente' : '· manual'}</span></td>
                        <td>{plan.asset ? `${plan.asset.tag} — ${plan.asset.name}` : 'Instalação geral'}</td>
                        <td>{plan.frequencyValue} × {FREQUENCY_LABELS[plan.frequencyUnit] ?? plan.frequencyUnit}</td>
                        <td>{formatDate(plan.nextDueAt)}</td>
                        <td><span className="table-primary">{plan.contract?.code ?? 'Sem contrato'}</span><span className="table-secondary">{plan.supplier?.tradeName || plan.supplier?.legalName || 'Fornecedor automático'}</span></td>
                        <td>{plan._count.generatedWorkOrders}</td>
                        <td><span className={`badge ${plan.active ? 'success' : 'warning'}`}>{plan.active ? 'Ativo' : 'Suspenso'}</span></td>
                      </tr>)}
                      {!detail?.maintenancePlans?.length ? <tr><td colSpan={7}>Nenhum plano de manutenção associado a esta edificação.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="form-section"><div className="notice"><AlertTriangle size={16} /> Salve a edificação para liberar documentos, fotografias, vistorias e planos associados.</div></section>
          )}

          <div className="form-footer">
            <button className="btn btn-secondary" type="button" onClick={closeForm}>Cancelar</button>
            <button className="btn btn-primary" type="submit" disabled={submitting || !location}>
              <Save size={16} /> {submitting ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar edificação'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <LoadingPanel /> : (
        <section className="card table-card">
          {items.length ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Edificação</th><th>Endereço</th><th>Tipo</th><th>Área</th><th>Georreferência</th><th>Última vistoria</th><th>OS</th>{canManage ? <th>Ações</th> : null}</tr></thead>
                <tbody>{items.map((item) => {
                  const hasCoordinates = item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined;
                  return (
                    <tr key={item.id}>
                      <td><span className="table-primary">{item.code} — {item.name}</span><span className="table-secondary">Status: {item.status.toLowerCase()}</span></td>
                      <td><span className="table-primary">{item.addressLine1}</span><span className="table-secondary">{item.city}/{item.state} · {item.postalCode}</span></td>
                      <td>{item.type || '—'}</td>
                      <td>{item.grossAreaM2 ? `${Number(item.grossAreaM2).toLocaleString('pt-BR')} m²` : '—'}</td>
                      <td>{hasCoordinates && item.geocodingConfirmed ? <><span className="badge success"><MapPin size={13} /> confirmada</span><span className="table-secondary">{item.geocodingProvider ?? 'manual'} · {item.geocodingAccuracy?.toLowerCase() ?? 'precisão não informada'}</span></> : hasCoordinates ? <span className="badge warning">requer confirmação</span> : <span className="badge warning">sem coordenadas</span>}</td>
                      <td><span className="table-primary">{formatDate(item.lastInspectionAt)}</span><span className="table-secondary">{item._count?.inspections ?? 0} registro(s)</span></td>
                      <td><span className="badge neutral">{item._count?.workOrders ?? 0}</span></td>
                      {canManage ? <td><div className="table-actions">
                        <button className="btn btn-ghost" type="button" onClick={() => void openEdit(item)}><Pencil size={15} /> Editar</button>
                        {canArchive ? <button className="btn btn-ghost danger-text" type="button" disabled={busyAction === `building-${item.id}`} onClick={() => void archiveBuilding(item)}><Trash2 size={15} /> Excluir</button> : null}
                      </div></td> : null}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Building2} title="Nenhuma edificação cadastrada" description="Cadastre o primeiro imóvel e confirme o ponto no mapa para começar a operação." />}
        </section>
      )}
    </div>
  );
}

function BuildingUploadField({
  icon: Icon,
  title,
  description,
  accept,
  kind,
  busy,
  onUpload,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  accept: string;
  kind: BuildingAttachmentKind;
  busy: boolean;
  onUpload: (kind: BuildingAttachmentKind, file: File) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const inputId = `building-file-${kind}`;
  return <div className="building-upload-card">
    <div className="building-upload-title"><span><Icon size={19} /></span><div><strong>{title}</strong><small>{description}</small></div></div>
    <label className="building-file-input" htmlFor={inputId}><Upload size={15} /><span>{file?.name ?? 'Selecionar arquivo'}</span></label>
    <input id={inputId} type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    <button className="btn btn-secondary" type="button" disabled={busy || !file} onClick={() => { if (file) void onUpload(kind, file).then((ok) => { if (ok) setFile(null); }); }}><Upload size={15} /> {busy ? 'Enviando…' : 'Incluir'}</button>
  </div>;
}

function Field({ col, label, children }: { col: string; label: string; children: React.ReactNode }) {
  return <div className={`field ${col}`}><label>{label}</label>{children}</div>;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}

function fileSize(value: string | number) {
  const bytes = Number(value);
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1_048_576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function attachmentKindLabel(kind: BuildingAttachmentKind) {
  return kind === 'INSPECTION_REPORT'
    ? 'Laudo de inspeção'
    : kind === 'PROPERTY_DOCUMENT'
      ? 'Documentação do imóvel'
      : 'Foto da edificação';
}

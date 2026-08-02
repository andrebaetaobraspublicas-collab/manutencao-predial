'use client';

import { ArrowLeft, Clock3, LoaderCircle, Save, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type {
  Building,
  CatalogItem,
  Contract,
  CurrentSession,
  SlaPreview,
  Supplier,
  TenantDirectoryMember,
  WorkOrder,
  WorkOrderCatalogs,
  WorkOrderPriority,
} from '@/lib/types';

const PRIVILEGED_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'CONTRACT_MANAGER', 'CONTRACT_INSPECTOR']);

function normalizeCatalogs(data: WorkOrderCatalogs | CatalogItem[]) {
  const items = Array.isArray(data)
    ? data
    : [...data.categories, ...data.specialties, ...data.environments, ...data.failureCauses];
  return {
    categories: items.filter((item) => item.kind === 'CATEGORY' && item.active),
    specialties: items.filter((item) => item.kind === 'SPECIALTY' && item.active),
    environments: items.filter((item) => item.kind === 'ENVIRONMENT' && item.active),
    causes: items.filter((item) => item.kind === 'CAUSE' && item.active),
  };
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [specialties, setSpecialties] = useState<CatalogItem[]>([]);
  const [environments, setEnvironments] = useState<CatalogItem[]>([]);
  const [causes, setCauses] = useState<CatalogItem[]>([]);
  const [directory, setDirectory] = useState<TenantDirectoryMember[]>([]);
  const [slaPreview, setSlaPreview] = useState<SlaPreview | null>(null);
  const [slaLoading, setSlaLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    buildingId: '',
    title: '',
    description: '',
    locationDetail: '',
    categoryId: '',
    specialtyId: '',
    environmentId: '',
    causeId: '',
    priority: 'NORMAL' as WorkOrderPriority,
    origin: 'USER_REQUEST',
    requesterUserId: '',
    supplierId: '',
    contractId: '',
    dueAt: '',
    estimatedCost: '',
  });

  useEffect(() => {
    apiFetch<CurrentSession>('/auth/me').then(async (sessionData) => {
      const canLoadPrivilegedOptions = PRIVILEGED_ROLES.has(sessionData.role);
      const [buildingItems, catalogData, privilegedOptions] = await Promise.all([
        apiFetch<Building[]>('/buildings'),
        apiFetch<WorkOrderCatalogs | CatalogItem[]>('/operations/catalogs?activeOnly=true'),
        canLoadPrivilegedOptions
          ? Promise.all([
              apiFetch<Contract[]>('/contracts'),
              apiFetch<Supplier[]>('/suppliers'),
              apiFetch<TenantDirectoryMember[]>('/members/directory').catch(() => []),
            ])
          : Promise.resolve<[Contract[], Supplier[], TenantDirectoryMember[]]>([[], [], []]),
      ]);
      return { buildingItems, catalogData, contractItems: privilegedOptions[0], supplierItems: privilegedOptions[1], directoryItems: privilegedOptions[2], sessionData };
    }).then(({ buildingItems, catalogData, contractItems, supplierItems, directoryItems, sessionData }) => {
      const normalized = normalizeCatalogs(catalogData);
      setBuildings(buildingItems);
      setContracts(contractItems);
      setSuppliers(supplierItems);
      setSession(sessionData);
      setCategories(normalized.categories);
      setSpecialties(normalized.specialties);
      setEnvironments(normalized.environments);
      setCauses(normalized.causes);
      setDirectory(directoryItems);
      const firstCategory = normalized.categories[0];
      setForm((current) => ({
        ...current,
        buildingId: buildingItems[0]?.id ?? '',
        categoryId: firstCategory?.id ?? '',
        specialtyId: '',
        requesterUserId: sessionData.user.id,
        priority: firstCategory?.defaultPriority ?? 'NORMAL',
      }));
    }).catch((cause: Error) => setError(cause.message)).finally(() => setLoadingOptions(false));
  }, []);

  const calculateSla = useCallback(async (priority: WorkOrderPriority, categoryId: string, contractId: string) => {
    if (!categoryId) {
      setSlaPreview(null);
      return;
    }
    setSlaLoading(true);
    try {
      const data = await apiFetch<SlaPreview>('/operations/sla/calculate', {
        method: 'POST',
        body: JSON.stringify({ startAt: new Date().toISOString(), priority, categoryId, contractId: contractId || undefined }),
      });
      setSlaPreview(data);
    } catch {
      setSlaPreview(null);
    } finally {
      setSlaLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void calculateSla(form.priority, form.categoryId, form.contractId);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [calculateSla, form.categoryId, form.contractId, form.priority]);

  function selectCategory(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    setForm((current) => ({
      ...current,
      categoryId,
      specialtyId: current.specialtyId,
      priority: category?.defaultPriority ?? current.priority,
    }));
  }

  function selectBuilding(buildingId: string) {
    setForm((current) => {
      const selectedContract = contracts.find((contract) => contract.id === current.contractId);
      const contractCoversBuilding = !current.contractId || Boolean(
        selectedContract?.buildings?.some((item) => item.building.id === buildingId),
      );

      return {
        ...current,
        buildingId,
        contractId: contractCoversBuilding ? current.contractId : '',
        supplierId: contractCoversBuilding ? current.supplierId : '',
      };
    });
  }

  function selectContract(contractId: string) {
    const contract = contracts.find((item) => item.id === contractId);
    setForm((current) => ({ ...current, contractId, supplierId: contract?.supplier.id ?? current.supplierId }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const privileged = session ? PRIVILEGED_ROLES.has(session.role) : false;
      const created = await apiFetch<WorkOrder>('/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          buildingId: form.buildingId,
          title: form.title,
          description: form.description,
          locationDetail: form.locationDetail || undefined,
          categoryId: form.categoryId,
          specialtyId: form.specialtyId || undefined,
          environmentId: form.environmentId || undefined,
          causeId: form.causeId || undefined,
          priority: form.priority,
          origin: privileged ? form.origin : 'USER_REQUEST',
          requesterUserId: privileged && form.requesterUserId ? form.requesterUserId : undefined,
          supplierId: privileged && form.supplierId ? form.supplierId : undefined,
          contractIds: privileged && form.contractId ? [form.contractId] : undefined,
          dueAt: privileged && form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
          estimatedCost: privileged && form.estimatedCost ? Number(form.estimatedCost) : undefined,
        }),
      });
      router.push(`/ordens-servico/detalhe?id=${created.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível emitir a ordem de serviço.');
    } finally {
      setSubmitting(false);
    }
  }

  const privileged = session ? PRIVILEGED_ROLES.has(session.role) : false;
  const selectedCategory = categories.find((item) => item.id === form.categoryId);
  const requesterOptions = Array.from(new Map([
    ...(session ? [session.user] : []),
    ...directory.map((membership) => membership.user),
  ].map((user) => [user.id, user])).values());

  return (
    <div className="page-container">
      <header className="page-header"><div className="page-title"><h1>Emitir ordem de serviço</h1><p>Classifique a demanda para aplicar automaticamente checklist, evidências e a regra de SLA correta.</p></div><Link className="btn btn-secondary" href="/ordens-servico"><ArrowLeft size={16} /> Voltar</Link></header>
      {error ? <div className="notice error page-notice" style={{ maxWidth: 1120 }}>{error}</div> : null}
      {!loadingOptions && !categories.length ? <div className="notice warning page-notice" style={{ maxWidth: 1120 }}><ShieldCheck size={17} /> Nenhuma categoria ativa está configurada. Peça a um administrador para concluir a configuração operacional.</div> : null}
      <form className="card form-card" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-header"><h2>Identificação e classificação</h2><p>Categoria e ambiente direcionam a equipe, o checklist e as evidências necessárias.</p></div>
          <div className="form-grid">
            <div className="field col-8"><label htmlFor="title">Título da OS *</label><input className="input" id="title" minLength={3} maxLength={220} required placeholder="Ex.: Vazamento no banheiro do 3º pavimento" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
            <div className="field col-4"><label htmlFor="buildingId">Edificação *</label><select className="select" id="buildingId" required disabled={loadingOptions} value={form.buildingId} onChange={(event) => selectBuilding(event.target.value)}><option value="">Selecione</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.code} — {building.name}</option>)}</select></div>
            <div className="field col-12"><label htmlFor="description">Descrição detalhada *</label><textarea className="textarea" id="description" minLength={3} maxLength={10000} required placeholder="Informe sintomas, contexto, risco percebido e demais detalhes úteis." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div className="field col-6"><label htmlFor="locationDetail">Local específico</label><input className="input" id="locationDetail" placeholder="Bloco, pavimento, sala ou equipamento" value={form.locationDetail} onChange={(event) => setForm({ ...form, locationDetail: event.target.value })} /></div>
            <div className="field col-3"><label htmlFor="categoryId">Categoria *</label><select className="select" id="categoryId" required value={form.categoryId} onChange={(event) => selectCategory(event.target.value)}><option value="">Selecione</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.code} — {category.name}</option>)}</select>{selectedCategory?.description ? <small>{selectedCategory.description}</small> : null}</div>
            <div className="field col-3"><label htmlFor="environmentId">Ambiente</label><select className="select" id="environmentId" value={form.environmentId} onChange={(event) => setForm({ ...form, environmentId: event.target.value })}><option value="">Não informado</option>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></div>
            <div className="field col-4"><label htmlFor="causeId">Causa presumida</label><select className="select" id="causeId" value={form.causeId} onChange={(event) => setForm({ ...form, causeId: event.target.value })}><option value="">A identificar na execução</option>{causes.map((cause) => <option key={cause.id} value={cause.id}>{cause.code} — {cause.name}</option>)}</select></div>
            <div className="field col-4"><label htmlFor="specialtyId">Especialidade</label><select className="select" id="specialtyId" value={form.specialtyId} onChange={(event) => setForm({ ...form, specialtyId: event.target.value })}><option value="">A definir na triagem</option>{specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}</select></div>
            <div className="field col-4"><label htmlFor="priority">Prioridade</label><select className="select" id="priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as WorkOrderPriority })}><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option><option value="CRITICAL">Crítica</option></select><small>{selectedCategory?.defaultPriority ? 'Sugerida pela categoria; ajuste se o risco real exigir.' : 'Defina conforme risco e impacto da demanda.'}</small></div>
            <div className="field col-4"><label htmlFor="origin">Origem</label><select className="select" id="origin" disabled={!privileged} value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })}><option value="USER_REQUEST">Solicitação de usuário</option><option value="PREVENTIVE_PLAN">Plano preventivo</option><option value="INSPECTION">Inspeção</option><option value="RECURRENT_FAILURE">Falha recorrente</option><option value="CONTRACT_REQUIREMENT">Obrigação contratual</option><option value="OTHER">Outra</option></select></div>
          </div>
        </section>

        {privileged ? <section className="form-section"><div className="form-section-header"><h2>Demandante, execução e contratação</h2><p>O demandante acompanha a solicitação; o contrato principal determina fornecedor e pode selecionar uma regra de SLA mais específica.</p></div><div className="form-grid"><div className="field col-6"><label htmlFor="requesterUserId">Demandante</label><select className="select" id="requesterUserId" value={form.requesterUserId} onChange={(event) => setForm({ ...form, requesterUserId: event.target.value })}>{requesterOptions.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></div><div className="field col-6"><label htmlFor="contractId">Contrato principal</label><select className="select" id="contractId" value={form.contractId} onChange={(event) => selectContract(event.target.value)}><option value="">Sem contrato definido</option>{contracts.filter((contract) => ['ACTIVE', 'EXPIRING'].includes(contract.status) && contract.buildings?.some((item) => item.building.id === form.buildingId)).map((contract) => <option key={contract.id} value={contract.id}>{contract.code} — {contract.object}</option>)}</select></div><div className="field col-6"><label htmlFor="supplierId">Fornecedor</label><select className="select" id="supplierId" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">A definir na triagem</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName || supplier.legalName}</option>)}</select></div><div className="field col-4"><label htmlFor="dueAt">Prazo operacional adicional</label><input className="input" id="dueAt" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /><small>Não substitui nem altera o SLA calculado.</small></div><div className="field col-4"><label htmlFor="estimatedCost">Custo estimado (R$)</label><input className="input" id="estimatedCost" type="number" min="0" step="0.01" value={form.estimatedCost} onChange={(event) => setForm({ ...form, estimatedCost: event.target.value })} /></div></div></section> : null}

        <section className="form-section sla-preview-section">
          <div className="form-section-header"><h2>Previsão de atendimento</h2><p>Estimativa calculada com prioridade, categoria, contrato, jornada e feriados. A OS salva um snapshot da regra efetivamente aplicada.</p></div>
          {slaLoading ? <div className="sla-preview loading"><LoaderCircle className="spin" size={20} /> Calculando prazos…</div> : slaPreview ? <div className="sla-preview"><span className="sla-preview-icon"><Clock3 size={20} /></span><div><small>Regra aplicada</small><strong>{slaPreview.policy?.name ?? slaPreview.sourceLabel ?? 'Regra padrão'}</strong><span>{slaPreview.calendar?.name ?? 'Calendário corrido'}</span></div><div><small>Resposta até</small><strong>{formatDateTime(slaPreview.responseDeadline)}</strong></div><div><small>Resolução até</small><strong>{formatDateTime(slaPreview.resolutionDeadline)}</strong></div></div> : <div className="notice warning">Não foi possível pré-calcular o SLA. A emissão só deve prosseguir quando existir uma regra aplicável no servidor.</div>}
        </section>

        <div className="form-footer"><Link className="btn btn-secondary" href="/ordens-servico">Cancelar</Link><button className="btn btn-primary" type="submit" disabled={submitting || loadingOptions || !form.buildingId || !form.categoryId || !slaPreview}><Save size={16} /> {submitting ? 'Emitindo…' : 'Emitir ordem de serviço'}</button></div>
      </form>
    </div>
  );
}

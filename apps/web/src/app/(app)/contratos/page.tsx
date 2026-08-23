'use client';

import { FileText, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/badge';
import { ContractWorkspace } from '@/components/contracts/contract-workspace';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import { BRL, formatDate } from '@/lib/format';
import type { Building, Contract, InspectorProfile, Supplier } from '@/lib/types';

type ReconciliationPortfolio = {
  contracts: Array<{ contract: { id: string }; status: 'CONSISTENT' | 'WARNING' | 'CRITICAL'; criticalCount: number; warningCount: number }>;
};

const EMPTY = {
  code: '',
  supplierId: '',
  object: '',
  type: 'INTEGRATED_MAINTENANCE',
  executionRegime: 'GLOBAL_PRICE',
  nature: 'CONTINUOUS',
  exclusiveLaborDedication: false,
  status: 'ACTIVE',
  startDate: '',
  endDate: '',
  originalValue: '',
  currentValue: '',
  adjustmentBaseDate: '',
  adjustmentIndex: '',
  administrativeProcess: '',
  buildingIds: [] as string[],
  notes: '',
};

export default function ContractsPage() {
  const [items, setItems] = useState<Contract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [inspectors, setInspectors] = useState<InspectorProfile[]>([]);
  const [reconciliation, setReconciliation] = useState<Record<string, ReconciliationPortfolio['contracts'][number]>>({});
  const [detail, setDetail] = useState<Contract | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [referenceTime] = useState(Date.now);

  const load = useCallback(async () => {
    try {
      const [contracts, supplierItems, buildingItems, inspectorItems, financial] = await Promise.all([
        apiFetch<Contract[]>('/contracts'),
        apiFetch<Supplier[]>('/suppliers'),
        apiFetch<Building[]>('/buildings'),
        apiFetch<InspectorProfile[]>('/inspectors'),
        apiFetch<ReconciliationPortfolio>('/finance/reconciliation'),
      ]);
      setItems(contracts);
      setSuppliers(supplierItems);
      setBuildings(buildingItems);
      setInspectors(inspectorItems);
      setReconciliation(Object.fromEntries(financial.contracts.map((item) => [item.contract.id, item])));
      setForm((current) => ({
        ...current,
        supplierId: current.supplierId || supplierItems[0]?.id || '',
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar contratos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function openContract(id: string) {
    try {
      setDetail(await apiFetch<Contract>(`/contracts/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao abrir contrato.');
    }
  }

  function toggleBuilding(id: string) {
    setForm((current) => ({
      ...current,
      buildingIds: current.buildingIds.includes(id)
        ? current.buildingIds.filter((item) => item !== id)
        : [...current.buildingIds, id],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(editingId ? `/contracts/${editingId}` : '/contracts', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...form,
          currentValue: undefined,
          originalValue: Number(form.originalValue),
          administrativeProcess: form.administrativeProcess || undefined,
          buildingIds: form.buildingIds.length ? form.buildingIds : undefined,
          adjustmentBaseDate: form.adjustmentBaseDate || undefined,
          adjustmentIndex: form.adjustmentIndex || undefined,
          notes: form.notes || undefined,
        }),
      });
      const updatedId = editingId;
      setForm({ ...EMPTY, supplierId: suppliers[0]?.id || '' });
      setEditingId(null);
      setShowForm(false);
      setLoading(true);
      await load();
      if (updatedId) await openContract(updatedId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar o contrato.');
    } finally {
      setSubmitting(false);
    }
  }

  function editContract(item: Contract) {
    setEditingId(item.id);
    setDetail(item);
    setShowForm(true);
    void openContract(item.id);
    setForm({
      code: item.code,
      supplierId: item.supplierId,
      object: item.object,
      type: item.type,
      executionRegime: item.executionRegime ?? 'GLOBAL_PRICE',
      nature: item.nature ?? 'CONTINUOUS',
      exclusiveLaborDedication: item.exclusiveLaborDedication ?? false,
      status: item.status,
      startDate: item.startDate.slice(0, 10),
      endDate: item.endDate.slice(0, 10),
      originalValue: String(item.originalValue),
      currentValue: String(item.currentValue),
      adjustmentBaseDate: item.adjustmentBaseDate?.slice(0, 10) ?? '',
      adjustmentIndex: item.adjustmentIndex ?? '',
      administrativeProcess: item.administrativeProcess ?? '',
      buildingIds: item.buildings?.map((entry) => entry.building.id) ?? [],
      notes: item.notes ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function archiveContract(item: Contract) {
    if (!window.confirm(
      `Excluir o contrato ${item.code}? Ele será arquivado, preservando OS, empenhos, medições e a trilha de auditoria.`,
    )) return;
    setError('');
    try {
      await apiFetch(`/contracts/${item.id}`, { method: 'DELETE' });
      if (detail?.id === item.id) setDetail(null);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível excluir o contrato.');
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY, supplierId: suppliers[0]?.id || '' });
  }

  return <div className="page-container">
    <header className="page-header">
      <div className="page-title">
        <h1>Contratos</h1>
        <p>Dossiê central da vigência, execução, fiscalização, garantias, comunicações e recebimentos.</p>
      </div>
      <button className="btn btn-primary" type="button" onClick={() => {
        if (showForm) closeForm(); else setShowForm(true);
      }}>
        {showForm ? <X size={16} /> : <Plus size={16} />}
        {showForm ? 'Fechar cadastro' : 'Novo contrato'}
      </button>
    </header>

    {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}

    {showForm ? <form className="card form-card" onSubmit={submit} style={{ marginBottom: 18 }}>
      <section className="form-section">
        <div className="form-section-header">
          <h2>{editingId ? 'Editar contrato' : 'Dados gerais do contrato'}</h2>
          <p>O valor atual é calculado pelo sistema a partir do valor original, aditivos, ajustes e apostilamentos financeiros.</p>
        </div>
        <div className="form-grid">
          <Field c="col-3" label="Número/código *"><input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field c="col-5" label="Fornecedor *"><select className="select" required value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">Selecione</option>{suppliers.map((item) => <option value={item.id} key={item.id}>{item.tradeName || item.legalName}</option>)}</select></Field>
          <Field c="col-4" label="Processo licitatório/contratação de origem"><input className="input" value={form.administrativeProcess} onChange={(e) => setForm({ ...form, administrativeProcess: e.target.value })} /></Field>
          <Field c="col-12" label="Objeto *"><textarea className="textarea" required value={form.object} onChange={(e) => setForm({ ...form, object: e.target.value })} /></Field>
          <Field c="col-3" label="Tipo operacional *"><select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="PREVENTIVE_MAINTENANCE">Manutenção preventiva</option><option value="CORRECTIVE_MAINTENANCE">Manutenção corretiva</option><option value="INTEGRATED_MAINTENANCE">Manutenção integrada</option><option value="OUTSOURCED_LABOR">Mão de obra terceirizada</option><option value="SUPPLY">Fornecimento</option><option value="OTHER">Outro</option></select></Field>
          <Field c="col-3" label="Regime de execução contratual *"><select className="select" value={form.executionRegime} onChange={(e) => setForm({ ...form, executionRegime: e.target.value })}><option value="UNIT_PRICE">Empreitada por preço unitário</option><option value="GLOBAL_PRICE">Empreitada por preço global</option><option value="TASK">Tarefa</option><option value="INTEGRAL">Empreitada integral</option><option value="INTEGRATED">Contratação integrada</option><option value="SEMI_INTEGRATED">Contratação semi-integrada</option><option value="SUPPLY_AND_ASSOCIATED_SERVICE">Fornecimento e prestação de serviço associado</option></select></Field>
          <Field c="col-2" label="Tipo de contrato *"><select className="select" value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })}><option value="CONTINUOUS">Contrato continuado</option><option value="SCOPE">Contrato de escopo</option></select></Field>
          <Field c="col-2" label="Dedicação exclusiva de mão de obra *"><select className="select" value={form.exclusiveLaborDedication ? 'true' : 'false'} onChange={(e) => setForm({ ...form, exclusiveLaborDedication: e.target.value === 'true' })}><option value="false">Não</option><option value="true">Sim</option></select></Field>
          <Field c="col-2" label="Status"><select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="DRAFT">Rascunho</option><option value="ACTIVE">Ativo</option><option value="SUSPENDED">Suspenso</option><option value="EXPIRING">A vencer</option><option value="EXPIRED">Vencido</option><option value="CLOSED">Encerrado</option></select></Field>
          <Field c="col-3" label="Início da vigência *"><input className="input" required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field c="col-3" label="Fim da vigência *"><input className="input" required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          <Field c="col-3" label="Valor original (R$) *"><input className="input" required type="number" min="0.01" step="0.01" value={form.originalValue} onChange={(e) => setForm({ ...form, originalValue: e.target.value })} /></Field>
          <Field c="col-3" label="Valor atual (calculado)"><input className="input" disabled value={form.currentValue ? BRL.format(Number(form.currentValue)) : 'Calculado ao salvar'} /></Field>
          <Field c="col-3" label="Data-base do reajuste"><input className="input" type="date" value={form.adjustmentBaseDate} onChange={(e) => setForm({ ...form, adjustmentBaseDate: e.target.value })} /></Field>
          <Field c="col-3" label="Índice de reajuste"><input className="input" placeholder="Ex.: IPCA" value={form.adjustmentIndex} onChange={(e) => setForm({ ...form, adjustmentIndex: e.target.value })} /></Field>
          <Field c="col-12" label="Edificações abrangidas"><div className="actions">{buildings.map((item) => <label className={`btn ${form.buildingIds.includes(item.id) ? 'btn-primary' : 'btn-secondary'}`} key={item.id}><input type="checkbox" checked={form.buildingIds.includes(item.id)} onChange={() => toggleBuilding(item.id)} style={{ display: 'none' }} />{item.code} — {item.name}</label>)}</div></Field>
          <Field c="col-12" label="Observações"><textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </section>
      <div className="form-footer"><button className="btn btn-secondary" type="button" onClick={closeForm}>Cancelar</button><button className="btn btn-primary" disabled={submitting || !form.supplierId}><Save size={16} /> {submitting ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar contrato'}</button></div>
    </form> : null}

    {loading ? <LoadingPanel /> : <section className="card table-card">
      {items.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Contrato / objeto</th><th>Fornecedor</th><th>Vigência</th><th>Status</th><th>Valor atual calculado</th><th>Medido</th><th>Saldo</th><th>Conciliação</th><th>Ações</th></tr></thead><tbody>{items.map((item) => {
        const balance = Number(item.currentValue) - Number(item.measuredValue);
        const days = Math.ceil((new Date(item.endDate).getTime() - referenceTime) / 86_400_000);
        const financial = reconciliation[item.id];
        return <tr key={item.id} onClick={() => void openContract(item.id)} style={{ cursor: 'pointer' }}><td><span className="table-primary">{item.code}</span><span className="table-secondary">{item.object}</span></td><td>{item.supplier.tradeName || item.supplier.legalName}</td><td><span className="table-primary">{formatDate(item.startDate)} a {formatDate(item.endDate)}</span><span className="table-secondary">{days >= 0 ? `${days} dia(s) restantes` : `vencido há ${Math.abs(days)} dia(s)`}</span></td><td><StatusBadge value={item.status} /></td><td>{BRL.format(Number(item.currentValue))}</td><td>{BRL.format(Number(item.measuredValue))}</td><td><span className={`badge ${balance < 0 ? 'danger' : 'success'}`}>{BRL.format(balance)}</span></td><td><span className={`badge ${financial?.status === 'CRITICAL' ? 'danger' : financial?.status === 'WARNING' ? 'warning' : 'success'}`}>{financial?.status === 'CRITICAL' ? `${financial.criticalCount} crítica(s)` : financial?.status === 'WARNING' ? `${financial.warningCount} aviso(s)` : 'Conciliado'}</span></td><td><div className="table-actions"><button className="btn btn-ghost" type="button" onClick={(event) => { event.stopPropagation(); editContract(item); }}><Pencil size={15} /> Editar</button><button className="btn btn-ghost danger-text" type="button" onClick={(event) => { event.stopPropagation(); void archiveContract(item); }}><Trash2 size={15} /> Excluir</button></div></td></tr>;
      })}</tbody></table></div> : <EmptyState icon={FileText} title="Nenhum contrato cadastrado" description="Cadastre o primeiro contrato para vincular fornecedores, edificações e ordens de serviço." />}
    </section>}

    {detail ? <ContractWorkspace
      contract={detail}
      suppliers={suppliers}
      inspectors={inspectors}
      onRefresh={async () => { await load(); await openContract(detail.id); }}
      onError={setError}
    /> : null}
  </div>;
}

function Field({ c, label, children }: { c: string; label: string; children: React.ReactNode }) {
  return <div className={`field ${c}`}><label>{label}</label>{children}</div>;
}

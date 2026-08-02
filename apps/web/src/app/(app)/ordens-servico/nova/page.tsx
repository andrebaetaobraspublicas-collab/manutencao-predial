'use client';

import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Building, Contract, Supplier, WorkOrder } from '@/lib/types';

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    buildingId: '', title: '', description: '', locationDetail: '', priority: 'NORMAL', origin: 'USER_REQUEST', supplierId: '', contractId: '', dueAt: '', estimatedCost: '',
  });

  useEffect(() => {
    Promise.all([
      apiFetch<Building[]>('/buildings'),
      apiFetch<Contract[]>('/contracts'),
      apiFetch<Supplier[]>('/suppliers'),
    ]).then(([buildingItems, contractItems, supplierItems]) => {
      setBuildings(buildingItems);
      setContracts(contractItems);
      setSuppliers(supplierItems);
      if (buildingItems[0]) setForm((current) => ({ ...current, buildingId: buildingItems[0].id }));
    }).catch((cause: Error) => setError(cause.message)).finally(() => setLoadingOptions(false));
  }, []);

  function selectContract(contractId: string) {
    const contract = contracts.find((item) => item.id === contractId);
    setForm((current) => ({ ...current, contractId, supplierId: contract?.supplier.id ?? current.supplierId }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const created = await apiFetch<WorkOrder>('/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          buildingId: form.buildingId,
          title: form.title,
          description: form.description,
          locationDetail: form.locationDetail || undefined,
          priority: form.priority,
          origin: form.origin,
          supplierId: form.supplierId || undefined,
          contractIds: form.contractId ? [form.contractId] : undefined,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
          estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
        }),
      });
      router.push(`/ordens-servico/detalhe?id=${created.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível emitir a ordem de serviço.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      <header className="page-header"><div className="page-title"><h1>Emitir ordem de serviço</h1><p>A ordem nasce vinculada ao imóvel e ao demandante autenticado. Contrato e fornecedor podem ser definidos na abertura ou durante a triagem.</p></div><Link className="btn btn-secondary" href="/ordens-servico"><ArrowLeft size={16} /> Voltar</Link></header>
      {error ? <div className="notice error" style={{ maxWidth: 1120, marginBottom: 18 }}>{error}</div> : null}
      <form className="card form-card" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-header"><h2>Identificação da demanda</h2><p>Descreva claramente o problema, o local e o nível de urgência.</p></div>
          <div className="form-grid">
            <div className="field col-8"><label htmlFor="title">Título da OS *</label><input className="input" id="title" minLength={3} maxLength={220} required placeholder="Ex.: Vazamento no banheiro do 3º pavimento" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
            <div className="field col-4"><label htmlFor="buildingId">Edificação *</label><select className="select" id="buildingId" required disabled={loadingOptions} value={form.buildingId} onChange={(event) => setForm({ ...form, buildingId: event.target.value })}><option value="">Selecione</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.code} — {building.name}</option>)}</select></div>
            <div className="field col-12"><label htmlFor="description">Descrição detalhada *</label><textarea className="textarea" id="description" minLength={3} maxLength={10000} required placeholder="Informe sintomas, contexto, risco percebido e demais detalhes úteis." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div className="field col-6"><label htmlFor="locationDetail">Local específico</label><input className="input" id="locationDetail" placeholder="Bloco, pavimento, sala ou equipamento" value={form.locationDetail} onChange={(event) => setForm({ ...form, locationDetail: event.target.value })} /></div>
            <div className="field col-3"><label htmlFor="priority">Prioridade</label><select className="select" id="priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option><option value="CRITICAL">Crítica</option></select></div>
            <div className="field col-3"><label htmlFor="origin">Origem</label><select className="select" id="origin" value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })}><option value="USER_REQUEST">Solicitação de usuário</option><option value="PREVENTIVE_PLAN">Plano preventivo</option><option value="INSPECTION">Inspeção</option><option value="RECURRENT_FAILURE">Falha recorrente</option><option value="CONTRACT_REQUIREMENT">Obrigação contratual</option><option value="OTHER">Outra</option></select></div>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-header"><h2>Execução e contratação</h2><p>O contrato selecionado define automaticamente o fornecedor correspondente.</p></div>
          <div className="form-grid">
            <div className="field col-6"><label htmlFor="contractId">Contrato principal</label><select className="select" id="contractId" value={form.contractId} onChange={(event) => selectContract(event.target.value)}><option value="">Sem contrato definido</option>{contracts.filter((contract) => ['ACTIVE', 'EXPIRING'].includes(contract.status)).map((contract) => <option key={contract.id} value={contract.id}>{contract.code} — {contract.object}</option>)}</select></div>
            <div className="field col-6"><label htmlFor="supplierId">Fornecedor</label><select className="select" id="supplierId" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">A definir na triagem</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName || supplier.legalName}</option>)}</select></div>
            <div className="field col-4"><label htmlFor="dueAt">Prazo operacional adicional</label><input className="input" id="dueAt" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /><small>O SLA padrão é calculado automaticamente conforme a prioridade.</small></div>
            <div className="field col-4"><label htmlFor="estimatedCost">Custo estimado (R$)</label><input className="input" id="estimatedCost" type="number" min="0" step="0.01" value={form.estimatedCost} onChange={(event) => setForm({ ...form, estimatedCost: event.target.value })} /></div>
          </div>
        </section>
        <div className="form-footer"><Link className="btn btn-secondary" href="/ordens-servico">Cancelar</Link><button className="btn btn-primary" type="submit" disabled={submitting || loadingOptions || !form.buildingId}><Save size={16} /> {submitting ? 'Emitindo…' : 'Emitir ordem de serviço'}</button></div>
      </form>
    </div>
  );
}

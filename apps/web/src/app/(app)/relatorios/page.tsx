'use client';

import {
  CalendarClock,
  Download,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiFileUrl } from '@/lib/api';
import type {
  Building,
  CatalogItem,
  Contract,
  Supplier,
  TenantDirectoryMember,
} from '@/lib/types';

type BacklogFilters = {
  search: string;
  priority: string;
  buildingId: string;
  supplierId: string;
  requesterUserId: string;
  assignedToUserId: string;
  categoryId: string;
  contractId: string;
  openedFrom: string;
  openedTo: string;
  ageMinDays: string;
  ageMaxDays: string;
  hasOpenPendency: boolean;
  overdue: boolean;
};

const EMPTY_FILTERS: BacklogFilters = {
  search: '',
  priority: '',
  buildingId: '',
  supplierId: '',
  requesterUserId: '',
  assignedToUserId: '',
  categoryId: '',
  contractId: '',
  openedFrom: '',
  openedTo: '',
  ageMinDays: '',
  ageMaxDays: '',
  hasOpenPendency: false,
  overdue: false,
};

export default function ReportsPage() {
  const [filters, setFilters] = useState<BacklogFilters>(EMPTY_FILTERS);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [members, setMembers] = useState<TenantDirectoryMember[]>([]);
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [contractId, setContractId] = useState('');
  const [expiringDays, setExpiringDays] = useState('90');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Building[]>('/buildings'),
      apiFetch<Supplier[]>('/suppliers'),
      apiFetch<Contract[]>('/contracts'),
      apiFetch<TenantDirectoryMember[]>('/members/directory'),
      apiFetch<CatalogItem[]>('/operations/catalogs?activeOnly=true'),
    ])
      .then(([buildingItems, supplierItems, contractItems, memberItems, catalogItems]) => {
        setBuildings(buildingItems);
        setSuppliers(supplierItems);
        setContracts(contractItems);
        setMembers(memberItems);
        setCategories(catalogItems.filter((item) => item.kind === 'CATEGORY'));
        setContractId(contractItems[0]?.id || '');
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const backlogQuery = useMemo(() => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === 'boolean') {
        if (value) query.set(key, 'true');
      } else if (value.trim()) {
        query.set(key, value.trim());
      }
    }
    return query.toString();
  }, [filters]);

  const expiringQuery = useMemo(() => {
    const query = new URLSearchParams({ days: expiringDays || '90' });
    return query.toString();
  }, [expiringDays]);

  function update<K extends keyof BacklogFilters>(key: K, value: BacklogFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>Central de relatórios</h1>
          <p>Documentos operacionais e contratuais reconciliados, com filtros, data de emissão e hash de integridade.</p>
        </div>
        <span className="badge success"><ShieldCheck size={14} /> escopo da organização</span>
      </header>

      {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}

      <section className="card form-card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div><h2>Backlog de ordens de serviço</h2><p>O PDF e o CSV utilizam o mesmo recorte e a mesma ordenação.</p></div>
          <FileBarChart size={20} />
        </div>
        <div className="card-body">
          <div className="form-grid">
            <Field className="col-4" label="Busca"><input className="input" placeholder="Número, título ou descrição" value={filters.search} onChange={(event) => update('search', event.target.value)} /></Field>
            <Field className="col-2" label="Prioridade"><select className="select" value={filters.priority} onChange={(event) => update('priority', event.target.value)}><option value="">Todas</option><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option><option value="CRITICAL">Crítica</option></select></Field>
            <Field className="col-3" label="Edificação"><select className="select" value={filters.buildingId} onChange={(event) => update('buildingId', event.target.value)}><option value="">Todas</option>{buildings.map((item) => <option value={item.id} key={item.id}>{item.code} — {item.name}</option>)}</select></Field>
            <Field className="col-3" label="Fornecedor"><select className="select" value={filters.supplierId} onChange={(event) => update('supplierId', event.target.value)}><option value="">Todos</option>{suppliers.map((item) => <option value={item.id} key={item.id}>{item.tradeName || item.legalName}</option>)}</select></Field>
            <Field className="col-3" label="Demandante"><select className="select" value={filters.requesterUserId} onChange={(event) => update('requesterUserId', event.target.value)}><option value="">Todos</option>{members.map((item) => <option value={item.user.id} key={item.id}>{item.user.name}</option>)}</select></Field>
            <Field className="col-3" label="Responsável"><select className="select" value={filters.assignedToUserId} onChange={(event) => update('assignedToUserId', event.target.value)}><option value="">Todos</option>{members.map((item) => <option value={item.user.id} key={item.id}>{item.user.name}</option>)}</select></Field>
            <Field className="col-3" label="Categoria"><select className="select" value={filters.categoryId} onChange={(event) => update('categoryId', event.target.value)}><option value="">Todas</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.code} — {item.name}</option>)}</select></Field>
            <Field className="col-3" label="Contrato"><select className="select" value={filters.contractId} onChange={(event) => update('contractId', event.target.value)}><option value="">Todos</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.code}</option>)}</select></Field>
            <Field className="col-3" label="Abertura inicial"><input className="input" type="date" value={filters.openedFrom} onChange={(event) => update('openedFrom', event.target.value)} /></Field>
            <Field className="col-3" label="Abertura final"><input className="input" type="date" value={filters.openedTo} onChange={(event) => update('openedTo', event.target.value)} /></Field>
            <Field className="col-2" label="Idade mínima (dias)"><input className="input" type="number" min="0" max="36500" value={filters.ageMinDays} onChange={(event) => update('ageMinDays', event.target.value)} /></Field>
            <Field className="col-2" label="Idade máxima (dias)"><input className="input" type="number" min="0" max="36500" value={filters.ageMaxDays} onChange={(event) => update('ageMaxDays', event.target.value)} /></Field>
            <div className="field col-2"><label className="checkbox-field"><input type="checkbox" checked={filters.hasOpenPendency} onChange={(event) => update('hasOpenPendency', event.target.checked)} /><span><strong>Com pendência</strong></span></label></div>
            <div className="field col-2"><label className="checkbox-field"><input type="checkbox" checked={filters.overdue} onChange={(event) => update('overdue', event.target.checked)} /><span><strong>SLA vencido</strong></span></label></div>
          </div>
          <div className="actions" style={{ marginTop: 18 }}>
            <a className="btn btn-primary" href={apiFileUrl(`/reports/work-orders/backlog.pdf?${backlogQuery}`)} target="_blank" rel="noreferrer"><Download size={16} /> Gerar PDF</a>
            <a className="btn btn-secondary" href={apiFileUrl(`/reports/work-orders/backlog.csv?${backlogQuery}`)}><FileSpreadsheet size={16} /> Gerar CSV</a>
            <button className="btn btn-ghost" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</button>
          </div>
        </div>
      </section>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-header"><div><h2>Contratos a vencer</h2><p>Recorte por janela futura para planejamento de prorrogações.</p></div><CalendarClock size={20} /></div>
          <div className="card-body">
            <Field label="Janela futura"><select className="select" value={expiringDays} onChange={(event) => setExpiringDays(event.target.value)}><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="180">180 dias</option><option value="365">365 dias</option></select></Field>
            <div className="actions" style={{ marginTop: 16 }}><a className="btn btn-primary" href={apiFileUrl(`/reports/contracts/expiring.pdf?${expiringQuery}`)} target="_blank" rel="noreferrer"><Download size={16} /> PDF</a><a className="btn btn-secondary" href={apiFileUrl(`/reports/contracts/expiring.csv?${expiringQuery}`)}><FileSpreadsheet size={16} /> CSV</a></div>
          </div>
        </section>

        <section className="card">
          <div className="card-header"><div><h2>Espelho e financeiro do contrato</h2><p>Cadastro, vigência, valores, saldos, medições e empenhos.</p></div><FileText size={20} /></div>
          <div className="card-body">
            <Field label="Contrato"><select className="select" value={contractId} onChange={(event) => setContractId(event.target.value)}><option value="">Selecione</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.code} — {item.object}</option>)}</select></Field>
            <div className="actions" style={{ marginTop: 16 }}><a className="btn btn-primary" aria-disabled={!contractId} href={contractId ? apiFileUrl(`/reports/contracts/${contractId}/mirror.pdf`) : undefined} target="_blank" rel="noreferrer"><Download size={16} /> Espelho PDF</a><a className="btn btn-secondary" aria-disabled={!contractId} href={contractId ? apiFileUrl(`/reports/contracts/${contractId}/financial.csv`) : undefined}><FileSpreadsheet size={16} /> Financeiro CSV</a></div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`field ${className}`}><label>{label}</label>{children}</div>;
}

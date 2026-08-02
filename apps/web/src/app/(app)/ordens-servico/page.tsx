'use client';

import { AlertTriangle, Download, FilePlus2, FileSpreadsheet, Search, Wrench } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { PriorityBadge, StatusBadge } from '@/components/badge';
import { apiFetch, apiFileUrl } from '@/lib/api';
import { daysSince, formatDate } from '@/lib/format';
import type { Building, Paginated, Supplier, WorkOrder } from '@/lib/types';

const STATUS_OPTIONS = [
  ['', 'Todos os status'],
  ['OPEN', 'Aberta'],
  ['TRIAGED', 'Triada'],
  ['ASSIGNED', 'Atribuída'],
  ['IN_PROGRESS', 'Em execução'],
  ['PENDING', 'Com pendência'],
  ['WAITING_APPROVAL', 'Aguardando aprovação'],
  ['COMPLETED', 'Concluída'],
  ['CLOSED', 'Fechada'],
  ['CANCELED', 'Cancelada'],
];

const PRIORITY_OPTIONS = [
  ['', 'Todas as prioridades'],
  ['LOW', 'Baixa'], ['NORMAL', 'Normal'], ['HIGH', 'Alta'], ['URGENT', 'Urgente'], ['CRITICAL', 'Crítica'],
];

type Filters = {
  search: string;
  status: string;
  priority: string;
  buildingId: string;
  supplierId: string;
  mode: 'backlog' | 'pending' | 'overdue' | 'all';
};

const INITIAL_FILTERS: Filters = {
  search: '', status: '', priority: '', buildingId: '', supplierId: '', mode: 'backlog',
};

export default function WorkOrdersPage() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<Filters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<WorkOrder> | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Building[]>('/buildings'),
      apiFetch<Supplier[]>('/suppliers'),
    ]).then(([buildingItems, supplierItems]) => {
      setBuildings(buildingItems);
      setSuppliers(supplierItems);
    }).catch(() => undefined);
  }, []);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (applied.search) query.set('search', applied.search);
    if (applied.status) query.set('status', applied.status);
    if (applied.priority) query.set('priority', applied.priority);
    if (applied.buildingId) query.set('buildingId', applied.buildingId);
    if (applied.supplierId) query.set('supplierId', applied.supplierId);
    if (applied.mode === 'backlog') query.set('backlogOnly', 'true');
    if (applied.mode === 'pending') query.set('hasOpenPendency', 'true');
    if (applied.mode === 'overdue') query.set('overdue', 'true');
    return query.toString();
  }, [applied, page]);

  const reportQueryString = useMemo(() => {
    const query = new URLSearchParams();
    if (applied.search) query.set('search', applied.search);
    if (applied.status) query.set('status', applied.status);
    if (applied.priority) query.set('priority', applied.priority);
    if (applied.buildingId) query.set('buildingId', applied.buildingId);
    if (applied.supplierId) query.set('supplierId', applied.supplierId);
    if (applied.mode === 'pending') query.set('hasOpenPendency', 'true');
    if (applied.mode === 'overdue') query.set('overdue', 'true');
    return query.toString();
  }, [applied]);

  const load = useCallback(() => {
    apiFetch<Paginated<WorkOrder>>(`/work-orders?${queryString}`)
      .then(setData)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [queryString]);

  useEffect(load, [load]);

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  }

  function setMode(mode: Filters['mode']) {
    const next = { ...filters, mode, status: mode === 'all' ? filters.status : '' };
    setFilters(next);
    setApplied(next);
    setPage(1);
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>Ordens de serviço</h1>
          <p>Controle analítico do backlog por edificação, fornecedor, demandante, prioridade, prazo e situação da execução.</p>
        </div>
        <div className="actions">
          <a className="btn btn-secondary" href={apiFileUrl(`/reports/work-orders/backlog.pdf?${reportQueryString}`)} target="_blank" rel="noreferrer"><Download size={16} /> PDF do backlog</a>
          <a className="btn btn-secondary" href={apiFileUrl(`/reports/work-orders/backlog.csv?${reportQueryString}`)}><FileSpreadsheet size={16} /> CSV</a>
          <Link className="btn btn-primary" href="/ordens-servico/nova"><FilePlus2 size={16} /> Emitir OS</Link>
        </div>
      </header>

      <div className="actions" style={{ marginBottom: 12 }} role="tablist" aria-label="Recortes do backlog">
        {([
          ['backlog', 'Backlog'], ['pending', 'Com pendências'], ['overdue', 'SLA vencido'], ['all', 'Todas'],
        ] as Array<[Filters['mode'], string]>).map(([mode, label]) => (
          <button key={mode} className={`btn ${filters.mode === mode ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => setMode(mode)}>{label}</button>
        ))}
      </div>

      <form className="filters" onSubmit={submitFilters}>
        <div className="field"><label htmlFor="search">Busca</label><div style={{ position: 'relative' }}><Search size={16} style={{ position: 'absolute', left: 11, top: 12, color: '#78869b' }} /><input id="search" className="input" style={{ paddingLeft: 35 }} placeholder="Número, título ou descrição" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></div></div>
        <div className="field"><label htmlFor="status">Status</label><select id="status" className="select" value={filters.status} disabled={filters.mode !== 'all'} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="priority">Prioridade</label><select id="priority" className="select" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>{PRIORITY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="building">Edificação</label><select id="building" className="select" value={filters.buildingId} onChange={(event) => setFilters({ ...filters, buildingId: event.target.value })}><option value="">Todas</option>{buildings.map((building) => <option value={building.id} key={building.id}>{building.code} — {building.name}</option>)}</select></div>
        <div className="field"><label htmlFor="supplier">Fornecedor</label><select id="supplier" className="select" value={filters.supplierId} onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })}><option value="">Todos</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.tradeName || supplier.legalName}</option>)}</select></div>
        <button className="btn btn-secondary" type="submit" style={{ alignSelf: 'end' }}>Aplicar</button>
      </form>

      {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}
      {loading ? <LoadingPanel label="Consultando ordens de serviço…" /> : (
        <section className="card table-card">
          {data?.items.length ? (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Ordem / serviço</th><th>Edificação</th><th>Fornecedor</th><th>Demandante</th><th>Idade / SLA</th><th>Prioridade</th><th>Status</th></tr></thead>
                  <tbody>{data.items.map((item) => {
                    const overdue = item.slaResolutionDeadline ? new Date(item.slaResolutionDeadline) < new Date() : false;
                    return <tr key={item.id}>
                      <td><Link className="table-primary" href={`/ordens-servico/detalhe?id=${item.id}`}>{item.number} — {item.title}</Link><span className="table-secondary">{item.locationDetail || item.description}</span></td>
                      <td><span className="table-primary">{item.building.code}</span><span className="table-secondary">{item.building.name}</span></td>
                      <td>{item.supplier ? <><span className="table-primary">{item.supplier.tradeName || item.supplier.legalName}</span><span className="table-secondary">{item.contracts.find((contract) => contract.isPrimary)?.contract.code || 'Sem contrato principal'}</span></> : <span className="badge neutral">Não definido</span>}</td>
                      <td><span className="table-primary">{item.requester.name}</span><span className="table-secondary">{item.requester.email}</span></td>
                      <td><span className={`badge ${overdue ? 'danger' : 'neutral'}`}>{daysSince(item.openedAt)} dias</span><span className="table-secondary">SLA: {formatDate(item.slaResolutionDeadline)}</span></td>
                      <td><PriorityBadge value={item.priority} /></td>
                      <td><StatusBadge value={item.status} />{item.hasOpenPendency ? <span className="table-secondary" style={{ color: '#9a5d09' }}>Pendência aberta</span> : null}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="pagination">
                <span>{data.pagination.total} registro(s) · página {data.pagination.page} de {data.pagination.totalPages}</span>
                <div className="actions"><button className="btn btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><button className="btn btn-secondary" type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
              </div>
            </>
          ) : <EmptyState icon={filters.mode === 'pending' ? AlertTriangle : Wrench} title="Nenhuma ordem encontrada" description="Não há registros que atendam aos filtros aplicados. Ajuste o recorte ou emita uma nova ordem de serviço." action={<Link className="btn btn-primary" href="/ordens-servico/nova">Emitir OS</Link>} />}
        </section>
      )}
    </div>
  );
}

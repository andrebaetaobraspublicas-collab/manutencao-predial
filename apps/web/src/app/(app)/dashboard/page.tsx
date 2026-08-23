'use client';

import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  Plus,
  SmilePlus,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BarList } from '@/components/bar-list';
import { BuildingsMap } from '@/components/buildings-map';
import { LoadingPanel } from '@/components/loading';
import { PriorityBadge, StatusBadge } from '@/components/badge';
import { apiFetch, apiFileUrl } from '@/lib/api';
import { BRL, formatDate } from '@/lib/format';
import type { DashboardOverview } from '@/lib/types';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<DashboardOverview>('/dashboard/overview')
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  if (!data && !error) return <LoadingPanel label="Montando o painel gerencial…" />;

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>Painel de manutenção predial</h1>
          <p>
            Visão consolidada do backlog de ordens de serviço, contratos, prazos, execução financeira e satisfação dos usuários.
          </p>
        </div>
        <div className="actions">
          <a className="btn btn-secondary" href={apiFileUrl('/reports/work-orders/backlog.pdf')} target="_blank" rel="noreferrer">
            <Download size={16} /> Backlog em PDF
          </a>
          <Link className="btn btn-primary" href="/ordens-servico/nova">
            <Plus size={16} /> Nova ordem de serviço
          </Link>
        </div>
      </header>

      {error ? <div className="notice error">{error}</div> : null}
      {data ? (
        <>
          <section className="grid grid-kpis" aria-label="Indicadores principais">
            <KpiCard label="Backlog total" value={data.workOrders.open} note={`${data.workOrders.createdThisMonth} abertas no mês`} icon={Wrench} />
            <KpiCard label="Com pendências" value={data.workOrders.pending} note="Exigem ação ou desbloqueio" icon={AlertTriangle} tone="warning" />
            <KpiCard label="SLA vencido" value={data.workOrders.overdue} note="Prazo de resolução superado" icon={Clock3} tone="danger" />
            <KpiCard label="Fechadas no mês" value={data.workOrders.closedThisMonth} note="Ordens encerradas no período" icon={FileCheck2} tone="success" />
            <KpiCard label="Contratos a vencer" value={data.contracts.expiringIn90Days} note="Próximos 90 dias" icon={CalendarClock} tone="warning" />
            <KpiCard
              label="Satisfação média"
              value={data.satisfaction.averageScore === null ? '—' : `${data.satisfaction.averageScore.toFixed(1)}/5`}
              note={`${data.satisfaction.responses} avaliações`}
              icon={SmilePlus}
              tone="success"
            />
          </section>

          <section className="dashboard-layout">
            <div className="card">
              <div className="card-header">
                <div><h2>Edificações georreferenciadas</h2><p>O número no marcador representa o backlog do imóvel.</p></div>
                <span className="badge neutral"><Building2 size={13} /> {data.map.length} no mapa</span>
              </div>
              <div className="card-body"><BuildingsMap buildings={data.map} /></div>
            </div>

            <div className="card">
              <div className="card-header">
                <div><h2>Execução dos contratos</h2><p>Valores dos contratos atualmente ativos.</p></div>
                <CircleDollarSign size={20} />
              </div>
              <div className="card-body">
                <FinanceRow label="Contratos ativos" value={String(data.contracts.active)} />
                <FinanceRow label="Valor contratual atual" value={BRL.format(data.contracts.currentValue)} />
                <FinanceRow label="Valor medido" value={BRL.format(data.contracts.measuredValue)} />
                <FinanceRow label="Valor pago" value={BRL.format(data.contracts.paidValue)} />
                <FinanceRow label="Saldo ainda não medido" value={BRL.format(data.contracts.unmeasuredBalance)} />
                <FinanceRow label="Medido e não pago" value={BRL.format(data.contracts.unpaidMeasuredBalance)} />
                <FinanceRow
                  label="Conciliação financeira"
                  value={data.contracts.reconciliation.criticalIssues
                    ? `${data.contracts.reconciliation.criticalIssues} inconsistência(s) crítica(s)`
                    : 'Sem inconsistências críticas'}
                />
                <div style={{ marginTop: 15 }}>
                  <div className="finance-row"><span>Execução financeira</span><strong>{data.contracts.executionPercent.toFixed(1)}%</strong></div>
                  <div className="bar-track" style={{ marginTop: 9, height: 10 }}>
                    <div className="bar-fill" style={{ width: `${Math.min(100, data.contracts.executionPercent)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-3" style={{ marginTop: 18 }}>
            <AnalyticsCard title="Backlog por idade" subtitle="Tempo desde a abertura" items={data.workOrders.ageBuckets.map(({ label, count }) => ({ label, total: count }))} />
            <AnalyticsCard title="Por edificação" subtitle="Dez imóveis com maior backlog" items={data.workOrders.byBuilding.map(({ label, count }) => ({ label, total: count }))} />
            <AnalyticsCard title="Por fornecedor" subtitle="Dez fornecedores com maior backlog" items={data.workOrders.bySupplier.map(({ label, count }) => ({ label, total: count }))} />
          </section>

          <section className="card table-card" style={{ marginTop: 18 }}>
            <div className="card-header">
              <div><h2>Ordens mais antigas do backlog</h2><p>Priorização gerencial pelo tempo em aberto.</p></div>
              <Link className="btn btn-ghost" href="/ordens-servico?backlogOnly=true">Ver todas</Link>
            </div>
            <div className="card-body" style={{ padding: '14px 0 0' }}>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Ordem</th><th>Edificação</th><th>Demandante</th><th>Idade</th><th>Prioridade</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.workOrders.oldest.map((item) => (
                      <tr key={item.id}>
                        <td><Link className="table-primary" href={`/ordens-servico/detalhe?id=${item.id}`}>{item.number} — {item.title}</Link><span className="table-secondary">Aberta em {formatDate(item.openedAt)}</span></td>
                        <td><span className="table-primary">{item.building.code}</span><span className="table-secondary">{item.building.name}</span></td>
                        <td>{item.requester.name}</td>
                        <td><span className={`badge ${item.overdue ? 'danger' : 'neutral'}`}>{item.ageDays} dias</span></td>
                        <td><PriorityBadge value={item.priority} /></td>
                        <td><StatusBadge value={item.status} /></td>
                      </tr>
                    ))}
                    {!data.workOrders.oldest.length ? <tr><td colSpan={6}>Não há ordens de serviço em backlog.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({ label, value, note, icon: Icon, tone = '' }: { label: string; value: string | number; note: string; icon: typeof Wrench; tone?: string }) {
  return <article className={`card kpi-card ${tone}`}><div className="kpi-head"><span className="kpi-label">{label}</span><span className="kpi-icon"><Icon size={18} /></span></div><div className="kpi-value">{value}</div><div className="kpi-note">{note}</div></article>;
}

function FinanceRow({ label, value }: { label: string; value: string }) {
  return <div className="finance-row"><span>{label}</span><strong>{value}</strong></div>;
}

function AnalyticsCard({ title, subtitle, items }: { title: string; subtitle: string; items: Array<{ label: string; total: number }> }) {
  return <div className="card"><div className="card-header"><div><h3>{title}</h3><p>{subtitle}</p></div></div><div className="card-body"><BarList items={items} /></div></div>;
}

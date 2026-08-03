'use client';

import {
  Calculator,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { StatusBadge } from '@/components/badge';
import { apiFetch, ApiError } from '@/lib/api';
import { BRL } from '@/lib/format';
import type { WorkOrder } from '@/lib/types';
import styles from './page.module.css';

type Stage = 'PLANNED' | 'APPROVED' | 'FINAL_EXECUTED';
type Catalog = {
  id: string;
  referenceMonth: string;
  state: string;
  version: string;
  itemCount: number;
  source: string;
  priceRegime: string;
  catalogKind: string;
  importedAt: string;
  active: boolean;
};
type CatalogFamily = {
  key: string;
  catalog: Catalog;
  version: string;
  itemCount: number;
  kinds: string[];
  importedAt: string;
};
type CatalogItem = {
  id: string;
  catalogId: string;
  type: 'INPUT' | 'COMPOSITION';
  code: string;
  description: string;
  unit: string;
  unitCost: string;
  compositionData?: Record<string, unknown> | null;
};
type CatalogItemDetail = CatalogItem & { catalog: Catalog };
type SearchResponse = {
  catalog: Catalog;
  items: CatalogItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: { units: string[] };
  scope: { catalogIds: string[]; includesInputsAndCompositions: boolean };
};
type Budget = {
  id: string;
  stage: Stage;
  status: string;
  version: number;
  subtotal: string;
  bdiPercentage: string;
  total: string;
  workOrder: { id: string; number: string; title: string };
  catalog?: Catalog | null;
  _count: { items: number; revisions: number };
};
type Line = {
  catalogItemId?: string;
  code: string;
  description: string;
  unit: string;
  unitCost: string;
  quantity: string;
};
type Filters = {
  search: string;
  type: string;
  unit: string;
  minCost: string;
  maxCost: string;
  page: number;
  pageSize: number;
};
type ImportResult = {
  totalItems: number;
  catalogs: Array<{ id: string; referenceMonth: string; state: string; sheet: string }>;
};

const STAGE_LABEL: Record<Stage, string> = {
  PLANNED: 'Previsto',
  APPROVED: 'Aprovado',
  FINAL_EXECUTED: 'Final executado',
};
const NEXT: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CANCELED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELED'],
  REJECTED: ['DRAFT', 'CANCELED'],
};
const TRANSITION_LABEL: Record<string, string> = {
  DRAFT: 'Reabrir rascunho',
  SUBMITTED: 'Enviar',
  APPROVED: 'Aprovar',
  REJECTED: 'Rejeitar',
  CANCELED: 'Cancelar',
};
const EMPTY_FILTERS: Filters = {
  search: '',
  type: '',
  unit: '',
  minCost: '',
  maxCost: '',
  page: 1,
  pageSize: 25,
};
const emptyLine = (): Line => ({ code: '', description: '', unit: 'UN', unitCost: '0', quantity: '1' });

export default function BudgetsPage() {
  const searchParams = useSearchParams();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [form, setForm] = useState({
    workOrderId: '',
    stage: 'PLANNED' as Stage,
    catalogId: '',
    bdiPercentage: '0',
    items: [] as Line[],
  });
  const [filterDraft, setFilterDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, CatalogItem>>({});
  const [detail, setDetail] = useState<CatalogItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [importForm, setImport] = useState({
    sourceType: 'SINAPI',
    referenceMonth: '',
    state: 'MG',
    version: '2026.04',
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [budgetRows, catalogRows, orderRows] = await Promise.all([
        apiFetch<Budget[]>('/budgets'),
        apiFetch<Catalog[]>('/budgets/sinapi/catalogs'),
        apiFetch<{ items: WorkOrder[] }>('/work-orders?pageSize=100'),
      ]);
      setBudgets(budgetRows);
      setCatalogs(catalogRows);
      setOrders(orderRows.items);
      setForm((value) => ({
        ...value,
        workOrderId: searchParams.get('workOrderId') || value.workOrderId || orderRows.items[0]?.id || '',
        catalogId: value.catalogId || dedupeCatalogs(catalogRows)[0]?.id || '',
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar orçamentos.');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!form.catalogId) {
        if (active) setResults(null);
        return;
      }
      const query = new URLSearchParams({
        page: String(filters.page),
        pageSize: String(filters.pageSize),
      });
      if (filters.search.trim()) query.set('search', filters.search.trim());
      if (filters.type) query.set('type', filters.type);
      if (filters.unit) query.set('unit', filters.unit);
      if (filters.minCost) query.set('minCost', filters.minCost);
      if (filters.maxCost) query.set('maxCost', filters.maxCost);
      if (active) setSearchLoading(true);
      try {
        const response = await apiFetch<SearchResponse>(
          `/budgets/sinapi/catalogs/${form.catalogId}/search?${query}`,
        );
        if (active) setResults(response);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Falha ao pesquisar o catálogo.');
      } finally {
        if (active) setSearchLoading(false);
      }
    });
    return () => { active = false; };
  }, [form.catalogId, filters]);

  const subtotal = useMemo(
    () => form.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
      0,
    ),
    [form.items],
  );
  const total = subtotal * (1 + Number(form.bdiPercentage || 0) / 100);
  const catalogOptions = useMemo(() => dedupeCatalogs(catalogs), [catalogs]);
  const importedCatalogs = useMemo(() => groupCatalogs(catalogs), [catalogs]);
  const selectedCount = Object.keys(selectedItems).length;
  const pageItems = results?.items ?? [];
  const allPageSelected = pageItems.length > 0 && pageItems.every((item) => selectedItems[item.id]);

  function selectCatalog(catalogId: string) {
    setForm((value) => ({
      ...value,
      catalogId,
      items: value.items.filter((item) => !item.catalogItemId),
    }));
    setSelectedItems({});
    setDetail(null);
    setFilterDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...filterDraft, page: 1 });
  }

  function clearFilters() {
    setFilterDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  function toggleItem(item: CatalogItem) {
    setSelectedItems((current) => {
      const next = { ...current };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return next;
    });
  }

  function togglePage() {
    setSelectedItems((current) => {
      const next = { ...current };
      for (const item of pageItems) {
        if (allPageSelected) delete next[item.id];
        else next[item.id] = item;
      }
      return next;
    });
  }

  function addSelectedItems() {
    const selected = Object.values(selectedItems);
    setForm((current) => {
      const existing = new Set(current.items.map((item) => item.catalogItemId).filter(Boolean));
      return {
        ...current,
        items: [
          ...current.items,
          ...selected
            .filter((item) => !existing.has(item.id))
            .map((item) => ({
              catalogItemId: item.id,
              code: item.code,
              description: item.description,
              unit: item.unit,
              unitCost: item.unitCost,
              quantity: '1',
            })),
        ],
      };
    });
    setSelectedItems({});
  }

  async function showDetail(item: CatalogItem) {
    if (!form.catalogId) return;
    setDetailLoading(true);
    try {
      setDetail(await apiFetch<CatalogItemDetail>(
        `/budgets/sinapi/catalogs/${item.catalogId}/items/${item.id}`,
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao consultar o item.');
    } finally {
      setDetailLoading(false);
    }
  }

  function patchLine(index: number, patch: Partial<Line>) {
    setForm((value) => ({
      ...value,
      items: value.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const catalog = catalogs.find((item) => item.id === form.catalogId);
      await apiFetch(`/budgets/work-orders/${form.workOrderId}?stage=${form.stage}`, {
        method: 'PUT',
        body: JSON.stringify({
          catalogId: form.catalogId || undefined,
          referenceMonth: catalog?.referenceMonth,
          state: catalog?.state,
          bdiPercentage: Number(form.bdiPercentage),
          items: form.items.map((item) => item.catalogItemId
            ? { catalogItemId: item.catalogItemId, quantity: Number(item.quantity) }
            : {
                code: item.code,
                description: item.description,
                unit: item.unit,
                unitCost: Number(item.unitCost),
                quantity: Number(item.quantity),
              }),
        }),
      });
      setForm((value) => ({ ...value, items: [] }));
      setLoading(true);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar orçamento.');
    } finally {
      setBusy(false);
    }
  }

  async function transition(budget: Budget, status: string) {
    let note: string | undefined;
    if (['REJECTED', 'CANCELED'].includes(status)) {
      note = window.prompt('Justificativa:')?.trim();
      if (!note) return;
    }
    setBusy(true);
    try {
      await apiFetch(`/budgets/${budget.id}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ status, version: budget.version, note }),
      });
      setLoading(true);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha na transição.');
    } finally {
      setBusy(false);
    }
  }

  async function importCatalog(event: FormEvent) {
    event.preventDefault();
    if (!importFile) return;
    setBusy(true);
    setError('');
    setImportResult('');
    try {
      const body = new FormData();
      body.set('file', importFile);
      body.set('sourceType', importForm.sourceType);
      body.set('state', importForm.state.toUpperCase());
      body.set('version', importForm.version);
      if (importForm.referenceMonth) body.set('referenceMonth', importForm.referenceMonth);
      const result = await apiFetch<ImportResult>('/budgets/catalogs/import-file', { method: 'POST', body });
      const detectedMonth = result.catalogs[0]?.referenceMonth;
      setImportResult(
        `${result.totalItems.toLocaleString('pt-BR')} itens importados em ${result.catalogs.length} catálogo(s). `
        + `Competência confirmada: ${formatMonth(detectedMonth)}.`,
      );
      if (detectedMonth) setImport((value) => ({ ...value, referenceMonth: detectedMonth }));
      if (result.catalogs[0]?.id) selectCatalog(result.catalogs[0].id);
      setLoading(true);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na importação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>Orçamentos e SINAPI</h1>
          <p>Pesquise o catálogo, selecione vários itens e envie-os diretamente ao orçamento da ordem de serviço.</p>
        </div>
      </header>

      {error ? (
        <div className="notice error" style={{ marginBottom: 18 }}>
          <span>{error}</span>
          <button className="btn btn-ghost" type="button" onClick={() => setError('')} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      ) : null}

      <section className="card form-card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <h2>Orçamento da ordem de serviço</h2>
            <p>Defina a OS, o estágio e a base de preços antes de escolher os itens.</p>
          </div>
          <Calculator size={19} />
        </div>
        <div className="card-body">
          <div className="form-grid">
            <F c="col-5" l="Ordem de serviço">
              <select className="select" required value={form.workOrderId}
                onChange={(event) => setForm({ ...form, workOrderId: event.target.value })}>
                {orders.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}
              </select>
            </F>
            <F c="col-2" l="Estágio">
              <select className="select" value={form.stage}
                onChange={(event) => setForm({ ...form, stage: event.target.value as Stage })}>
                <option value="PLANNED">Previsto</option>
                <option value="APPROVED">Aprovado</option>
                <option value="FINAL_EXECUTED">Final executado</option>
              </select>
            </F>
            <F c="col-2" l="BDI (%)">
              <input className="input" type="number" min="0" step="0.01" value={form.bdiPercentage}
                onChange={(event) => setForm({ ...form, bdiPercentage: event.target.value })} />
            </F>
            <F c="col-3" l="Catálogo de preços">
              <select className="select" value={form.catalogId}
                onChange={(event) => selectCatalog(event.target.value)}>
                <option value="">Somente itens próprios</option>
                {catalogOptions.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>{catalogLabel(catalog)}</option>
                ))}
              </select>
            </F>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <h2>Explorar catálogo SINAPI</h2>
            <p>Use os filtros e marque todos os serviços e insumos que deseja levar ao orçamento.</p>
          </div>
          <Search size={19} />
        </div>
        <div className="card-body">
          {!form.catalogId ? (
            <EmptyState icon={Database} title="Selecione um catálogo"
              description="Escolha uma base de preços acima para pesquisar composições e insumos." />
          ) : (
            <>
              <form className={styles.filters} onSubmit={applyFilters}>
                <F c="" l="Código ou descrição">
                  <input className="input" value={filterDraft.search} placeholder="Ex.: pintura, 88489"
                    onChange={(event) => setFilterDraft({ ...filterDraft, search: event.target.value })} />
                </F>
                <F c="" l="Tipo">
                  <select className="select" value={filterDraft.type}
                    onChange={(event) => setFilterDraft({ ...filterDraft, type: event.target.value })}>
                    <option value="">Todos</option>
                    <option value="COMPOSITION">Composições</option>
                    <option value="INPUT">Insumos</option>
                  </select>
                </F>
                <F c="" l="Unidade">
                  <select className="select" value={filterDraft.unit}
                    onChange={(event) => setFilterDraft({ ...filterDraft, unit: event.target.value })}>
                    <option value="">Todas</option>
                    {(results?.facets.units ?? []).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </F>
                <F c="" l="Custo mínimo">
                  <input className="input" type="number" min="0" step="0.01" value={filterDraft.minCost}
                    onChange={(event) => setFilterDraft({ ...filterDraft, minCost: event.target.value })} />
                </F>
                <F c="" l="Custo máximo">
                  <input className="input" type="number" min="0" step="0.01" value={filterDraft.maxCost}
                    onChange={(event) => setFilterDraft({ ...filterDraft, maxCost: event.target.value })} />
                </F>
                <div className={styles.filterActions}>
                  <button className="btn btn-secondary" type="button" onClick={clearFilters}>Limpar</button>
                  <button className="btn btn-primary" type="submit"><Search size={15} />Pesquisar</button>
                </div>
              </form>

              <div className={styles.catalogSummary}>
                <div>
                  <strong>{results?.pagination.total.toLocaleString('pt-BR') ?? 0} itens encontrados</strong>
                  <span>{results ? catalogLabel(results.catalog) : 'Carregando catálogo...'}</span>
                </div>
                <div className="actions">
                  <span className="badge neutral">{selectedCount} selecionado(s)</span>
                  <button className="btn btn-primary" type="button" disabled={!selectedCount}
                    onClick={addSelectedItems}>
                    <CheckSquare size={15} />Adicionar ao orçamento da OS
                  </button>
                </div>
              </div>

              {searchLoading ? <LoadingPanel /> : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className={styles.checkColumn}>
                          <input type="checkbox" checked={allPageSelected} onChange={togglePage}
                            aria-label="Selecionar página" />
                        </th>
                        <th>Código</th>
                        <th>Tipo</th>
                        <th>Descrição</th>
                        <th>Unidade</th>
                        <th>Custo unitário</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item) => (
                        <tr key={item.id} className={selectedItems[item.id] ? styles.selectedRow : undefined}>
                          <td>
                            <input type="checkbox" checked={Boolean(selectedItems[item.id])}
                              onChange={() => toggleItem(item)} aria-label={`Selecionar ${item.code}`} />
                          </td>
                          <td><span className="table-primary">{item.code}</span></td>
                          <td><span className="badge neutral">{itemTypeLabel(item.type)}</span></td>
                          <td>{item.description}</td>
                          <td>{item.unit}</td>
                          <td className={styles.money}>{BRL.format(Number(item.unitCost))}</td>
                          <td>
                            <button className="btn btn-ghost" type="button" disabled={detailLoading}
                              onClick={() => void showDetail(item)}>
                              <Eye size={15} />Consultar
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!pageItems.length ? (
                        <tr><td colSpan={7} className={styles.noResults}>Nenhum item corresponde aos filtros.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}

              <div className={styles.pagination}>
                <label>
                  Itens por página
                  <select className="select" value={filters.pageSize}
                    onChange={(event) => {
                      const pageSize = Number(event.target.value);
                      setFilterDraft((value) => ({ ...value, pageSize }));
                      setFilters((value) => ({ ...value, page: 1, pageSize }));
                    }}>
                    {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
                <div className="actions">
                  <button className="btn btn-secondary" type="button"
                    disabled={(results?.pagination.page ?? 1) <= 1}
                    onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}>
                    <ChevronLeft size={15} />Anterior
                  </button>
                  <span>Página {results?.pagination.page ?? 1} de {results?.pagination.totalPages ?? 1}</span>
                  <button className="btn btn-secondary" type="button"
                    disabled={(results?.pagination.page ?? 1) >= (results?.pagination.totalPages ?? 1)}
                    onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}>
                    Próxima<ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <form className="card form-card" style={{ marginBottom: 18 }} onSubmit={save}>
        <div className="card-header">
          <div>
            <h2>Itens do orçamento</h2>
            <p>Ajuste as quantidades, inclua itens próprios e confira o total antes de salvar.</p>
          </div>
          <strong>{BRL.format(total)}</strong>
        </div>
        <div className="card-body">
          {form.items.length ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Custo unitário</th><th>Quantidade</th><th>Total</th><th /></tr></thead>
                <tbody>
                  {form.items.map((item, index) => (
                    <tr key={`${item.catalogItemId || 'free'}-${index}`}>
                      <td><input className="input" disabled={Boolean(item.catalogItemId)} required value={item.code}
                        onChange={(event) => patchLine(index, { code: event.target.value })} /></td>
                      <td><input className="input" disabled={Boolean(item.catalogItemId)} required value={item.description}
                        onChange={(event) => patchLine(index, { description: event.target.value })} /></td>
                      <td><input className="input" disabled={Boolean(item.catalogItemId)} required value={item.unit}
                        onChange={(event) => patchLine(index, { unit: event.target.value })} /></td>
                      <td><input className="input" type="number" min="0" step="0.000001"
                        disabled={Boolean(item.catalogItemId)} value={item.unitCost}
                        onChange={(event) => patchLine(index, { unitCost: event.target.value })} /></td>
                      <td><input className="input" type="number" min="0.000001" step="0.000001" value={item.quantity}
                        onChange={(event) => patchLine(index, { quantity: event.target.value })} /></td>
                      <td className={styles.money}>{BRL.format(Number(item.quantity || 0) * Number(item.unitCost || 0))}</td>
                      <td><button className="btn btn-ghost" type="button"
                        onClick={() => setForm((value) => ({ ...value, items: value.items.filter((_, itemIndex) => itemIndex !== index) }))}
                        aria-label="Remover item"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Calculator} title="Orçamento ainda sem itens"
              description="Selecione itens do catálogo acima ou inclua um item próprio." />
          )}
          <div className={styles.budgetFooter}>
            <button className="btn btn-secondary" type="button"
              onClick={() => setForm((value) => ({ ...value, items: [...value.items, emptyLine()] }))}>
              <Plus size={14} />Item próprio
            </button>
            <div className={styles.totals}>
              <span>Subtotal <strong>{BRL.format(subtotal)}</strong></span>
              <span>BDI ({Number(form.bdiPercentage || 0).toLocaleString('pt-BR')}%)</span>
              <button className="btn btn-primary" disabled={busy || !form.items.length || !form.workOrderId}>
                Salvar orçamento — {BRL.format(total)}
              </button>
            </div>
          </div>
        </div>
      </form>

      <form className="card form-card" style={{ marginBottom: 18 }} onSubmit={importCatalog}>
        <div className="card-header">
          <div>
            <h2>Importar catálogo XLSX</h2>
            <p>A competência SINAPI é lida do relatório e pode ser informada abaixo para conferência.</p>
          </div>
          <Database size={19} />
        </div>
        <div className="card-body">
          <div className="form-grid">
            <F c="col-3" l="Origem">
              <select className="select" value={importForm.sourceType}
                onChange={(event) => setImport({
                  ...importForm,
                  sourceType: event.target.value,
                  referenceMonth: event.target.value === 'SINAPI' ? '' : importForm.referenceMonth,
                })}>
                <option value="SINAPI">SINAPI oficial</option>
                <option value="CUSTOM">Tabela própria</option>
              </select>
            </F>
            <F c="col-2" l="UF">
              <input className="input" required maxLength={2} value={importForm.state}
                onChange={(event) => setImport({ ...importForm, state: event.target.value })} />
            </F>
            <F c="col-3" l={importForm.sourceType === 'SINAPI' ? 'Competência esperada (opcional)' : 'Competência'}>
              <input className="input" type="month" required={importForm.sourceType === 'CUSTOM'}
                value={importForm.referenceMonth}
                onChange={(event) => setImport({ ...importForm, referenceMonth: event.target.value })} />
            </F>
            <F c="col-2" l="Versão">
              <input className="input" required value={importForm.version}
                onChange={(event) => setImport({ ...importForm, version: event.target.value })} />
            </F>
            <F c="col-12" l="Arquivo">
              <input className="input" type="file" accept=".xlsx"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} />
            </F>
          </div>
          <p className={styles.helpText}>
            No SINAPI oficial, deixe a competência vazia para usar automaticamente a data do relatório. Se preencher,
            o sistema confere o valor e bloqueia divergências.
          </p>
          {importResult ? <div className="notice success">{importResult}</div> : null}
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={busy || !importFile}>Importar XLSX</button>
          </div>
        </div>
      </form>

      <section className="card table-card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <h2>Bases SINAPI importadas</h2>
            <p>Histórico das competências disponíveis para consulta e elaboração dos orçamentos.</p>
          </div>
          <Database size={19} />
        </div>
        {importedCatalogs.length ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Base</th>
                  <th>Competência / UF</th>
                  <th>Regime</th>
                  <th>Conteúdo disponível</th>
                  <th>Itens</th>
                  <th>Importada em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {importedCatalogs.map((family) => (
                  <tr key={family.key}>
                    <td>
                      <span className="table-primary">{family.catalog.source}</span>
                      <span className="table-secondary">Versão {family.version}</span>
                    </td>
                    <td>
                      <span className="table-primary">{formatMonth(family.catalog.referenceMonth)}</span>
                      <span className="table-secondary">{family.catalog.state}</span>
                    </td>
                    <td><span className="badge neutral">{regimeLabel(family.catalog.priceRegime)}</span></td>
                    <td>{family.kinds.map((kind) => kindLabel(kind)).join(' e ')}</td>
                    <td>{family.itemCount.toLocaleString('pt-BR')}</td>
                    <td>{formatDateTime(family.importedAt)}</td>
                    <td>
                      <button className="btn btn-secondary" type="button" onClick={() => {
                        selectCatalog(family.catalog.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>
                        <Search size={14} />Consultar itens
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Database} title="Nenhuma base importada"
            description="Importe um relatório SINAPI XLSX para disponibilizar composições e insumos." />
        )}
      </section>

      {loading ? <LoadingPanel /> : (
        <section className="card table-card">
          {budgets.length ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>OS</th><th>Estágio</th><th>Status</th><th>Versão</th><th>Itens</th><th>Total</th><th>Ações</th></tr></thead>
                <tbody>{budgets.map((budget) => (
                  <tr key={budget.id}>
                    <td><span className="table-primary">{budget.workOrder.number}</span><span className="table-secondary">{budget.workOrder.title}</span></td>
                    <td><span className="badge neutral">{STAGE_LABEL[budget.stage]}</span></td>
                    <td><StatusBadge value={budget.status} /></td>
                    <td>v{budget.version}</td>
                    <td>{budget._count.items}</td>
                    <td>{BRL.format(Number(budget.total))}</td>
                    <td><div className="actions">{(NEXT[budget.status] ?? []).map((status) => (
                      <button key={status} type="button" className={status === 'APPROVED' ? 'btn btn-primary' : 'btn btn-secondary'}
                        disabled={busy} onClick={() => void transition(budget, status)}>
                        <Send size={14} />{TRANSITION_LABEL[status] ?? status}
                      </button>
                    ))}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Calculator} title="Nenhum orçamento" description="Componha o orçamento previsto da primeira OS." />}
        </section>
      )}

      {detail ? <CatalogDetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function CatalogDetailModal({ detail, onClose }: { detail: CatalogItemDetail; onClose: () => void }) {
  const metadata = detail.compositionData ?? {};
  const classification = stringValue(metadata.classification);
  const priceOrigin = stringValue(metadata.priceOrigin);
  const socialCharges = stringValue(metadata.socialChargesAttributedPercentage);
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="catalog-detail-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.modalHeader}>
          <div>
            <span className="badge neutral">{itemTypeLabel(detail.type)}</span>
            <h2 id="catalog-detail-title">{detail.code} — {detail.description}</h2>
          </div>
          <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Fechar consulta"><X size={18} /></button>
        </header>
        <div className={styles.detailGrid}>
          <Detail label="Custo unitário" value={BRL.format(Number(detail.unitCost))} />
          <Detail label="Unidade" value={detail.unit} />
          <Detail label="Competência" value={formatMonth(detail.catalog.referenceMonth)} />
          <Detail label="UF" value={detail.catalog.state} />
          <Detail label="Regime" value={regimeLabel(detail.catalog.priceRegime)} />
          <Detail label="Catálogo" value={kindLabel(detail.catalog.catalogKind)} />
          {classification ? <Detail label="Classificação SINAPI" value={classification} /> : null}
          {priceOrigin ? <Detail label="Origem do preço" value={priceOrigin} /> : null}
          {socialCharges ? <Detail label="Encargos atribuídos" value={`${socialCharges}%`} /> : null}
        </div>
        {detail.type === 'COMPOSITION' ? (
          <div className="notice warning">
            Esta é uma composição sintética. O relatório importado não contém a composição analítica nem seus
            componentes, conforme o escopo atual do sistema.
          </div>
        ) : null}
        <footer className={styles.modalFooter}>
          <button className="btn btn-primary" type="button" onClick={onClose}>Concluir consulta</button>
        </footer>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className={styles.detailItem}><span>{label}</span><strong>{value}</strong></div>;
}

function F({ c, l, children }: { c: string; l: string; children: React.ReactNode }) {
  return <div className={`field ${c}`}><label>{l}</label>{children}</div>;
}

function catalogLabel(catalog: Catalog) {
  const contents = catalog.source === 'SINAPI' ? 'Composições e insumos' : kindLabel(catalog.catalogKind);
  return `${catalog.source} ${catalog.state} · ${formatMonth(catalog.referenceMonth)} · ${contents} · ${regimeLabel(catalog.priceRegime)}`;
}

function dedupeCatalogs(catalogs: Catalog[]) {
  const families = new Map<string, Catalog>();
  for (const catalog of catalogs) {
    const rootVersion = catalog.version.replace(/-(ISD|ICD|CSD|CCD)$/i, '');
    const key = catalog.source === 'SINAPI'
      ? [catalog.source, catalog.state, catalog.referenceMonth, catalog.priceRegime, rootVersion].join('|')
      : catalog.id;
    const current = families.get(key);
    if (!current || (catalog.catalogKind === 'COMPOSITIONS' && current.catalogKind !== 'COMPOSITIONS')) {
      families.set(key, catalog);
    }
  }
  return [...families.values()];
}

function groupCatalogs(catalogs: Catalog[]): CatalogFamily[] {
  const families = new Map<string, CatalogFamily & { kindSet: Set<string> }>();
  for (const catalog of catalogs) {
    const version = catalog.version.replace(/-(ISD|ICD|CSD|CCD)$/i, '');
    const key = catalog.source === 'SINAPI'
      ? [catalog.source, catalog.state, catalog.referenceMonth, catalog.priceRegime, version].join('|')
      : catalog.id;
    const current = families.get(key);
    if (!current) {
      families.set(key, {
        key,
        catalog,
        version,
        itemCount: catalog.itemCount,
        kinds: [],
        kindSet: new Set([catalog.catalogKind]),
        importedAt: catalog.importedAt,
      });
      continue;
    }
    current.itemCount += catalog.itemCount;
    current.kindSet.add(catalog.catalogKind);
    if (catalog.catalogKind === 'COMPOSITIONS' && current.catalog.catalogKind !== 'COMPOSITIONS') {
      current.catalog = catalog;
    }
    if (new Date(catalog.importedAt) > new Date(current.importedAt)) current.importedAt = catalog.importedAt;
  }
  return [...families.values()].map(({ kindSet, ...family }) => ({
    ...family,
    kinds: [...kindSet].sort((left) => left === 'COMPOSITIONS' ? -1 : 1),
  }));
}

function formatMonth(value?: string) {
  if (!value) return 'não identificada';
  const [year, month] = value.split('-');
  return month && year ? `${month}/${year}` : value;
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function itemTypeLabel(value: string) {
  return value === 'COMPOSITION' ? 'Composição' : 'Insumo';
}

function kindLabel(value: string) {
  if (value === 'COMPOSITIONS') return 'Composições';
  if (value === 'INPUTS') return 'Insumos';
  return 'Misto';
}

function regimeLabel(value: string) {
  if (value === 'EXEMPT') return 'Desonerado';
  if (value === 'NON_EXEMPT') return 'Não desonerado';
  return 'Não aplicável';
}

function stringValue(value: unknown) {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

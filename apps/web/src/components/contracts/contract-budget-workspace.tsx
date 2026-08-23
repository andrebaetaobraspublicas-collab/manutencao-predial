'use client';

import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UsersRound,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { BRL } from '@/lib/format';
import styles from './contract-budget-workspace.module.css';

type Kind = 'SUPPORT_SERVICE' | 'LABOR_POST' | 'MATERIAL' | 'ON_DEMAND_SERVICE'
  | 'SINAPI_INPUT' | 'SINAPI_COMPOSITION' | 'OTHER';

type ContractBudgetItem = {
  id: string;
  kind: Kind;
  source: string;
  sectionCode?: string | null;
  sectionName?: string | null;
  code: string;
  description: string;
  technicalReference?: string | null;
  unit: string;
  quantity: string;
  laborUnitCost: string;
  materialUnitCost: string;
  unitCost: string;
  bdiPercentage: string;
  totalCost: string;
  includedInTotal: boolean;
  sourceSheet?: string | null;
};

type LaborComponent = {
  id: string;
  module?: string | null;
  submodule?: string | null;
  code?: string | null;
  description: string;
  percentage?: string | null;
  amount: string;
  basis?: string | null;
};

type LaborPost = {
  id: string;
  code: string;
  title: string;
  unit: string;
  postQuantity: string;
  employeesPerPost: string;
  professionalQuantity: string;
  months: string;
  cbo?: string | null;
  collectiveAgreement?: string | null;
  mteRegistration?: string | null;
  categoryBaseDate?: string | null;
  shift?: string | null;
  baseSalary: string;
  monthlyCostBeforeBdi: string;
  bdiAmount: string;
  monthlyCost: string;
  annualCost: string;
  includedInTotal: boolean;
  sourceSheet?: string | null;
  components: LaborComponent[];
};

type ContractBudget = {
  id: string;
  title?: string | null;
  referenceMonth?: string | null;
  status: string;
  version: number;
  subtotal: string;
  bdiAmount: string;
  total: string;
  notes?: string | null;
  laborPosts: LaborPost[];
  _count: { items: number; laborPosts: number; revisions: number };
};

type BudgetResponse = {
  contract: { id: string; code: string; object: string; exclusiveLaborDedication: boolean; currentValue: string };
  budget: ContractBudget | null;
  reconciliation: {
    status: 'CONSISTENT' | 'WARNING' | 'CRITICAL';
    criticalCount: number;
    warningCount: number;
    checks: Array<{ code: string; severity: 'CRITICAL' | 'WARNING'; message: string; difference?: number }>;
    values: { storedCurrentValue: number; contractBudgetTotal: number | null; budgetVariance: number | null };
  };
};

type ItemsResponse = {
  items: ContractBudgetItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type Catalog = { id: string; state: string; referenceMonth: string; version: string; source: string; active: boolean };
type CatalogItem = { id: string; type: 'INPUT' | 'COMPOSITION'; code: string; description: string; unit: string; unitCost: string };

const KIND_LABEL: Record<Kind, string> = {
  SUPPORT_SERVICE: 'Serviço de apoio',
  LABOR_POST: 'Posto de trabalho',
  MATERIAL: 'Material/insumo',
  ON_DEMAND_SERVICE: 'Serviço eventual',
  SINAPI_INPUT: 'Insumo SINAPI',
  SINAPI_COMPOSITION: 'Composição SINAPI',
  OTHER: 'Outro',
};

const emptyItem = {
  kind: 'MATERIAL' as Kind,
  sectionCode: '',
  sectionName: '',
  code: '',
  description: '',
  technicalReference: '',
  unit: 'UN',
  quantity: '1',
  laborUnitCost: '0',
  materialUnitCost: '0',
  unitCost: '0',
  bdiPercentage: '0',
  includedInTotal: true,
};

const emptyPost = {
  code: '', title: '', unit: 'POSTO', postQuantity: '1', employeesPerPost: '1', months: '12',
  cbo: '', collectiveAgreement: '', mteRegistration: '', categoryBaseDate: '', shift: '',
  baseSalary: '0', monthlyCostBeforeBdi: '0', bdiAmount: '0', monthlyCost: '0', annualCost: '',
  includedInTotal: true,
};

type LaborComponentDraft = {
  module: string;
  submodule: string;
  code: string;
  description: string;
  percentage: string;
  amount: string;
  basis: string;
};

const emptyComponent: LaborComponentDraft = {
  module: '', submodule: '', code: '', description: '', percentage: '', amount: '0', basis: '',
};

export function ContractBudgetWorkspace({ contractId, onError }: {
  contractId: string;
  onError(value: string): void;
}) {
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [items, setItems] = useState<ItemsResponse | null>(null);
  const [section, setSection] = useState<'items' | 'posts' | 'sinapi'>('items');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [postForm, setPostForm] = useState(emptyPost);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postEditorOpen, setPostEditorOpen] = useState(false);
  const [postComponents, setPostComponents] = useState<LaborComponentDraft[]>([]);
  const [componentForm, setComponentForm] = useState<LaborComponentDraft>(emptyComponent);
  const [editingComponentIndex, setEditingComponentIndex] = useState<number | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importTitle, setImportTitle] = useState('');
  const [referenceMonth, setReferenceMonth] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogId, setCatalogId] = useState('');
  const [sinapiSearch, setSinapiSearch] = useState('');
  const [sinapiItems, setSinapiItems] = useState<CatalogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (search.trim()) query.set('search', search.trim());
    if (kind) query.set('kind', kind);
    setItems(await apiFetch<ItemsResponse>(`/budgets/contracts/${contractId}/items?${query}`));
  }, [contractId, kind, page, search]);

  const load = useCallback(async () => {
    try {
      const [budgetResponse, catalogRows] = await Promise.all([
        apiFetch<BudgetResponse>(`/budgets/contracts/${contractId}`),
        apiFetch<Catalog[]>('/budgets/sinapi/catalogs'),
      ]);
      setData(budgetResponse);
      setCatalogs(catalogRows.filter((catalog) => catalog.active));
      setCatalogId((current) => current || catalogRows.find((catalog) => catalog.active)?.id || '');
      await loadItems();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Falha ao carregar a planilha orçamentária do contrato.');
    } finally {
      setLoading(false);
    }
  }, [contractId, loadItems, onError]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const budget = data?.budget;
  const totalComponents = useMemo(
    () => budget?.laborPosts.reduce((sum, post) => sum + post.components.length, 0) ?? 0,
    [budget?.laborPosts],
  );

  async function importBudget(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    onError('');
    try {
      const body = new FormData();
      body.append('file', file);
      if (importTitle.trim()) body.append('title', importTitle.trim());
      if (referenceMonth) body.append('referenceMonth', referenceMonth);
      body.append('replaceExisting', String(replaceExisting));
      await apiFetch(`/budgets/contracts/${contractId}/import`, { method: 'POST', body });
      setFile(null);
      setImportTitle('');
      await load();
      setSection('items');
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Não foi possível importar a planilha.');
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError('');
    try {
      await apiFetch(`/budgets/contracts/${contractId}/items${editingItemId ? `/${editingItemId}` : ''}`, {
        method: editingItemId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...itemForm,
          quantity: Number(itemForm.quantity),
          laborUnitCost: Number(itemForm.laborUnitCost),
          materialUnitCost: Number(itemForm.materialUnitCost),
          unitCost: Number(itemForm.unitCost),
          bdiPercentage: Number(itemForm.bdiPercentage),
          sectionCode: itemForm.sectionCode || undefined,
          sectionName: itemForm.sectionName || undefined,
          technicalReference: itemForm.technicalReference || undefined,
        }),
      });
      setItemForm(emptyItem);
      setEditingItemId(null);
      setItemEditorOpen(false);
      await load();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Não foi possível salvar o item.');
    } finally {
      setBusy(false);
    }
  }

  function editItem(item: ContractBudgetItem) {
    setEditingItemId(item.id);
    setItemForm({
      kind: item.kind,
      sectionCode: item.sectionCode ?? '',
      sectionName: item.sectionName ?? '',
      code: item.code,
      description: item.description,
      technicalReference: item.technicalReference ?? '',
      unit: item.unit,
      quantity: String(item.quantity),
      laborUnitCost: String(item.laborUnitCost),
      materialUnitCost: String(item.materialUnitCost),
      unitCost: String(item.unitCost),
      bdiPercentage: String(item.bdiPercentage),
      includedInTotal: item.includedInTotal,
    });
    setItemEditorOpen(true);
    scrollToEditor(styles.itemForm);
  }

  function newItem() {
    setEditingItemId(null);
    setItemForm(emptyItem);
    setItemEditorOpen(true);
    scrollToEditor(styles.itemForm);
  }

  function cancelItemEditor() {
    setEditingItemId(null);
    setItemForm(emptyItem);
    setItemEditorOpen(false);
  }

  async function removeItem(item: ContractBudgetItem) {
    if (!window.confirm(`Excluir o item ${item.code}? A alteração ficará registrada no histórico.`)) return;
    await action(`/budgets/contracts/${contractId}/items/${item.id}`, 'DELETE');
  }

  async function savePost(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError('');
    try {
      await apiFetch(`/budgets/contracts/${contractId}/labor-posts${editingPostId ? `/${editingPostId}` : ''}`, {
        method: editingPostId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...postForm,
          postQuantity: Number(postForm.postQuantity),
          employeesPerPost: Number(postForm.employeesPerPost),
          months: Number(postForm.months),
          baseSalary: Number(postForm.baseSalary),
          monthlyCostBeforeBdi: Number(postForm.monthlyCostBeforeBdi),
          bdiAmount: Number(postForm.bdiAmount),
          monthlyCost: Number(postForm.monthlyCost),
          cbo: postForm.cbo || undefined,
          collectiveAgreement: postForm.collectiveAgreement || undefined,
          mteRegistration: postForm.mteRegistration || undefined,
          categoryBaseDate: postForm.categoryBaseDate || undefined,
          shift: postForm.shift || undefined,
          annualCost: postForm.annualCost.trim() ? Number(postForm.annualCost) : undefined,
          components: postComponents.map((component) => ({
            module: component.module.trim() || undefined,
            submodule: component.submodule.trim() || undefined,
            code: component.code.trim() || undefined,
            description: component.description.trim(),
            percentage: component.percentage.trim() ? Number(component.percentage) / 100 : undefined,
            amount: Number(component.amount),
            basis: component.basis.trim() || undefined,
          })),
        }),
      });
      setPostForm(emptyPost);
      setEditingPostId(null);
      setPostComponents([]);
      setComponentForm(emptyComponent);
      setEditingComponentIndex(null);
      setPostEditorOpen(false);
      await load();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Não foi possível salvar o posto de trabalho.');
    } finally {
      setBusy(false);
    }
  }

  function editPost(post: LaborPost) {
    setEditingPostId(post.id);
    setPostForm({
      code: post.code,
      title: post.title,
      unit: post.unit,
      postQuantity: String(post.postQuantity),
      employeesPerPost: String(post.employeesPerPost),
      months: String(post.months),
      cbo: post.cbo ?? '',
      collectiveAgreement: post.collectiveAgreement ?? '',
      mteRegistration: post.mteRegistration ?? '',
      categoryBaseDate: post.categoryBaseDate ?? '',
      shift: post.shift ?? '',
      baseSalary: String(post.baseSalary),
      monthlyCostBeforeBdi: String(post.monthlyCostBeforeBdi),
      bdiAmount: String(post.bdiAmount),
      monthlyCost: String(post.monthlyCost),
      annualCost: String(post.annualCost),
      includedInTotal: post.includedInTotal,
    });
    setPostComponents(post.components.map((component) => ({
      module: component.module ?? '',
      submodule: component.submodule ?? '',
      code: component.code ?? '',
      description: component.description,
      percentage: component.percentage ? String(Number(component.percentage) * 100) : '',
      amount: String(component.amount),
      basis: component.basis ?? '',
    })));
    setComponentForm(emptyComponent);
    setEditingComponentIndex(null);
    setPostEditorOpen(true);
    scrollToEditor(styles.postForm);
  }

  function newPost() {
    setEditingPostId(null);
    setPostForm(emptyPost);
    setPostComponents([]);
    setComponentForm(emptyComponent);
    setEditingComponentIndex(null);
    setPostEditorOpen(true);
    scrollToEditor(styles.postForm);
  }

  function cancelPostEditor() {
    setEditingPostId(null);
    setPostForm(emptyPost);
    setPostComponents([]);
    setComponentForm(emptyComponent);
    setEditingComponentIndex(null);
    setPostEditorOpen(false);
  }

  function saveComponent() {
    if (!componentForm.description.trim()) return;
    setPostComponents((current) => {
      if (editingComponentIndex === null) return [...current, componentForm];
      return current.map((component, index) => index === editingComponentIndex ? componentForm : component);
    });
    setComponentForm(emptyComponent);
    setEditingComponentIndex(null);
  }

  function editComponent(index: number) {
    setComponentForm(postComponents[index]);
    setEditingComponentIndex(index);
    scrollToEditor(styles.componentEditor);
  }

  function removeComponent(index: number) {
    setPostComponents((current) => current.filter((_, currentIndex) => currentIndex !== index));
    if (editingComponentIndex === index) {
      setComponentForm(emptyComponent);
      setEditingComponentIndex(null);
    }
  }

  async function removePost(post: LaborPost) {
    if (!window.confirm(`Excluir o posto ${post.title}?`)) return;
    await action(`/budgets/contracts/${contractId}/labor-posts/${post.id}`, 'DELETE');
  }

  async function searchSinapi(event: FormEvent) {
    event.preventDefault();
    if (!catalogId) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '25' });
      if (sinapiSearch.trim()) query.set('search', sinapiSearch.trim());
      const result = await apiFetch<{ items: CatalogItem[] }>(`/budgets/sinapi/catalogs/${catalogId}/search?${query}`);
      setSinapiItems(result.items);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Falha ao pesquisar o SINAPI.');
    } finally {
      setBusy(false);
    }
  }

  async function addSinapi(item: CatalogItem) {
    setBusy(true);
    try {
      await apiFetch(`/budgets/contracts/${contractId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          catalogItemId: item.id,
          kind: item.type === 'INPUT' ? 'SINAPI_INPUT' : 'SINAPI_COMPOSITION',
          code: item.code,
          description: item.description,
          unit: item.unit,
          quantity: 1,
          unitCost: Number(item.unitCost),
          includedInTotal: true,
        }),
      });
      await load();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o item SINAPI.');
    } finally {
      setBusy(false);
    }
  }

  async function action(path: string, method: string) {
    setBusy(true);
    onError('');
    try {
      await apiFetch(path, { method });
      await load();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }

  async function changeBudgetStatus(status: 'ACTIVE' | 'DRAFT') {
    setBusy(true);
    onError('');
    try {
      await apiFetch(`/budgets/contracts/${contractId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Não foi possível alterar a situação da planilha.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className={styles.loading}>Carregando planilha orçamentária…</div>;

  return <div className={styles.workspace}>
    <div className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>Orçamento do contrato</span>
        <h3>{budget?.title || `Planilha orçamentária — ${data?.contract.code}`}</h3>
        <p>Fonte contratual para postos de trabalho, materiais, serviços eventuais e preços SINAPI usados pelas ordens de serviço.</p>
      </div>
      <div className={styles.heroActions}><span className={`${styles.status} ${budget?.status === 'ACTIVE' ? styles.active : ''}`}>{budget?.status === 'ACTIVE' ? 'Ativo' : 'Em elaboração'}</span>{budget ? <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void changeBudgetStatus(budget.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE')}>{budget.status === 'ACTIVE' ? 'Reabrir para edição' : 'Ativar como oficial'}</button> : null}</div>
    </div>

    <div className={`${styles.reconciliation} ${styles[data?.reconciliation.status.toLowerCase() ?? 'warning']}`}>
      <div><strong>{data?.reconciliation.status === 'CRITICAL' ? 'Conciliação bloqueada' : data?.reconciliation.status === 'WARNING' ? 'Conciliação pendente' : 'Planilha conciliada'}</strong><span>Valor contratual atual: {BRL.format(data?.reconciliation.values.storedCurrentValue ?? 0)} · planilha: {BRL.format(data?.reconciliation.values.contractBudgetTotal ?? 0)} · diferença: {BRL.format(data?.reconciliation.values.budgetVariance ?? 0)}</span></div>
      {data?.reconciliation.checks.length ? <ul>{data.reconciliation.checks.map((check) => <li key={check.code}>{check.message}</li>)}</ul> : <span>A planilha fecha com o contrato e pode ser usada como referência oficial das ordens de serviço.</span>}
    </div>

    <div className={styles.summaryGrid}>
      <SummaryCard label="Total calculado" value={BRL.format(Number(budget?.total ?? 0))} />
      <SummaryCard label="Valor contratual atual" value={BRL.format(data?.reconciliation.values.storedCurrentValue ?? 0)} />
      <SummaryCard label="Diferença para o contrato" value={BRL.format(data?.reconciliation.values.budgetVariance ?? 0)} />
      <SummaryCard label="Subtotal sem BDI" value={BRL.format(Number(budget?.subtotal ?? 0))} />
      <SummaryCard label="BDI/encargos destacados" value={BRL.format(Number(budget?.bdiAmount ?? 0))} />
      <SummaryCard label="Itens de preço" value={String(budget?._count.items ?? 0)} />
      <SummaryCard label="Postos / componentes" value={`${budget?.laborPosts.length ?? 0} / ${totalComponents}`} />
    </div>

    <form className={styles.importPanel} onSubmit={importBudget}>
      <div className={styles.importTitle}><Upload size={20} /><div><strong>Importar planilha do contrato</strong><span>XLSX, XLSB ou PDF textual · o arquivo é processado e descartado; somente os dados importados permanecem no sistema</span></div></div>
      <input className="input" type="file" accept=".xlsx,.xlsb,.pdf" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <input className="input" placeholder="Título do orçamento (opcional)" value={importTitle} onChange={(event) => setImportTitle(event.target.value)} />
      <input className="input" type="month" value={referenceMonth} onChange={(event) => setReferenceMonth(event.target.value)} />
      <label className={styles.checkbox}><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /> Substituir itens atuais</label>
      <button className="btn btn-primary" disabled={busy || !file}><Upload size={16} /> {busy ? 'Processando…' : 'Importar e validar'}</button>
    </form>

    <div className={styles.tabs}>
      <Tab active={section === 'items'} onClick={() => setSection('items')} icon={<PackageSearch size={16} />} label="Itens e serviços" />
      <Tab active={section === 'posts'} onClick={() => setSection('posts')} icon={<UsersRound size={16} />} label="Postos de trabalho" />
      <Tab active={section === 'sinapi'} onClick={() => setSection('sinapi')} icon={<Search size={16} />} label="Adicionar do SINAPI" />
    </div>

    {section === 'items' ? <div className={styles.section}>
      <div className={styles.sectionToolbar}>
        <div><strong>Itens, materiais e serviços eventuais</strong><span>Inclua registros manualmente ou edite os itens já cadastrados.</span></div>
        <button className="btn btn-primary" type="button" onClick={newItem}><Plus size={16} /> Novo item ou serviço</button>
      </div>
      {itemEditorOpen ? <form className={`${styles.editor} ${styles.itemForm}`} onSubmit={saveItem}>
        <div className={styles.editorHeader}><div><Plus size={18} /><strong>{editingItemId ? 'Editar item ou serviço' : 'Novo item ou serviço manual'}</strong></div><button className="btn btn-ghost" type="button" onClick={cancelItemEditor}><X size={15} /> Fechar</button></div>
        <div className="form-grid">
          <Field c="col-3" label="Categoria"><select className="select" value={itemForm.kind} onChange={(event) => setItemForm({ ...itemForm, kind: event.target.value as Kind })}>{Object.entries(KIND_LABEL).filter(([value]) => value !== 'LABOR_POST').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field c="col-2" label="Código *"><input className="input" required value={itemForm.code} onChange={(event) => setItemForm({ ...itemForm, code: event.target.value })} /></Field>
          <Field c="col-5" label="Descrição *"><input className="input" required value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /></Field>
          <Field c="col-2" label="Unidade *"><input className="input" required value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} /></Field>
          <Field c="col-2" label="Quantidade"><input className="input" type="number" min="0" step="0.000001" value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: event.target.value })} /></Field>
          <Field c="col-2" label="Preço unitário"><input className="input" type="number" min="0" step="0.000001" value={itemForm.unitCost} onChange={(event) => setItemForm({ ...itemForm, unitCost: event.target.value })} /></Field>
          <Field c="col-2" label="Mão de obra/unid."><input className="input" type="number" min="0" step="0.000001" value={itemForm.laborUnitCost} onChange={(event) => setItemForm({ ...itemForm, laborUnitCost: event.target.value })} /></Field>
          <Field c="col-2" label="Materiais/unid."><input className="input" type="number" min="0" step="0.000001" value={itemForm.materialUnitCost} onChange={(event) => setItemForm({ ...itemForm, materialUnitCost: event.target.value })} /></Field>
          <Field c="col-2" label="BDI (%)"><input className="input" type="number" min="0" step="0.000001" value={itemForm.bdiPercentage} onChange={(event) => setItemForm({ ...itemForm, bdiPercentage: event.target.value })} /></Field>
          <Field c="col-2" label="Referência"><input className="input" value={itemForm.technicalReference} onChange={(event) => setItemForm({ ...itemForm, technicalReference: event.target.value })} /></Field>
          <Field c="col-4" label="Grupo/seção"><input className="input" value={itemForm.sectionName} onChange={(event) => setItemForm({ ...itemForm, sectionName: event.target.value })} /></Field>
        </div>
        <div className={styles.editorFooter}><label className={styles.checkbox}><input type="checkbox" checked={itemForm.includedInTotal} onChange={(event) => setItemForm({ ...itemForm, includedInTotal: event.target.checked })} /> Incluir na totalização</label><button className="btn btn-primary" disabled={busy}>{editingItemId ? 'Salvar alterações' : 'Adicionar item'}</button></div>
      </form> : <div className={styles.guidance}><CircleHelp size={18} /><span>Use <strong>Novo item ou serviço</strong> para cadastrar materiais e serviços eventuais que não vieram da planilha nem do SINAPI.</span></div>}
      <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setPage(1); void loadItems(); }}>
        <input className="input" placeholder="Pesquisar código, descrição ou grupo" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="select" value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{Object.entries(KIND_LABEL).filter(([value]) => value !== 'LABOR_POST').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button className="btn btn-secondary"><Search size={16} /> Pesquisar</button>
      </form>
      <div className="table-wrapper"><table className="data-table"><thead><tr><th>Código / descrição</th><th>Categoria</th><th>Unid.</th><th>Qtd.</th><th>Preço unitário</th><th>Total</th><th>Ações</th></tr></thead><tbody>
        {items?.items.length ? items.items.map((item) => <tr key={item.id}><td><span className="table-primary">{item.code} — {item.description}</span><span className="table-secondary">{item.sectionName || item.sourceSheet || item.source}</span></td><td>{KIND_LABEL[item.kind]}</td><td>{item.unit}</td><td>{Number(item.quantity).toLocaleString('pt-BR')}</td><td>{BRL.format(Number(item.unitCost))}</td><td>{BRL.format(Number(item.totalCost))}</td><td><div className="table-actions"><button className="btn btn-ghost" type="button" onClick={() => editItem(item)}><Pencil size={14} /> Editar</button><button className="btn btn-ghost danger-text" type="button" onClick={() => void removeItem(item)}><Trash2 size={14} /> Excluir</button></div></td></tr>) : <tr><td colSpan={7} className={styles.empty}>Nenhum item corresponde aos filtros.</td></tr>}
      </tbody></table></div>
      <div className={styles.pagination}><span>{items?.pagination.total ?? 0} item(ns)</span><div><button className="btn btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {items?.pagination.totalPages ?? 1}</span><button className="btn btn-secondary" type="button" disabled={page >= (items?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></div>
    </div> : null}

    {section === 'posts' ? <div className={styles.section}>
      <div className={styles.sectionToolbar}>
        <div><strong>Postos de trabalho e composição de custos</strong><span>Cadastre o posto e detalhe salários, benefícios, encargos, insumos e demais componentes.</span></div>
        <button className="btn btn-primary" type="button" onClick={newPost}><Plus size={16} /> Novo posto de trabalho</button>
      </div>
      {postEditorOpen ? <form className={`${styles.editor} ${styles.postForm}`} onSubmit={savePost}>
        <div className={styles.editorHeader}><div><BriefcaseBusiness size={18} /><strong>{editingPostId ? 'Editar posto de trabalho' : 'Novo posto de trabalho'}</strong></div><button className="btn btn-ghost" type="button" onClick={cancelPostEditor}><X size={15} /> Fechar</button></div>
        <div className="form-grid">
          <Field c="col-2" label="Código *"><input className="input" required value={postForm.code} onChange={(event) => setPostForm({ ...postForm, code: event.target.value })} /></Field>
          <Field c="col-5" label="Posto/profissional *"><input className="input" required value={postForm.title} onChange={(event) => setPostForm({ ...postForm, title: event.target.value })} /></Field>
          <Field c="col-2" label="CBO"><input className="input" value={postForm.cbo} onChange={(event) => setPostForm({ ...postForm, cbo: event.target.value })} /></Field>
          <Field c="col-3" label="Jornada/turno"><input className="input" value={postForm.shift} onChange={(event) => setPostForm({ ...postForm, shift: event.target.value })} /></Field>
          <Field c="col-2" label="Qtd. de postos"><input className="input" type="number" min="0" step="0.0001" value={postForm.postQuantity} onChange={(event) => setPostForm({ ...postForm, postQuantity: event.target.value })} /></Field>
          <Field c="col-2" label="Empregados/posto"><input className="input" type="number" min="0" step="0.0001" value={postForm.employeesPerPost} onChange={(event) => setPostForm({ ...postForm, employeesPerPost: event.target.value })} /></Field>
          <Field c="col-2" label="Meses"><input className="input" type="number" min="0" step="0.0001" value={postForm.months} onChange={(event) => setPostForm({ ...postForm, months: event.target.value })} /></Field>
          <Field c="col-3" label="Salário-base"><input className="input" type="number" min="0" step="0.01" value={postForm.baseSalary} onChange={(event) => setPostForm({ ...postForm, baseSalary: event.target.value })} /></Field>
          <Field c="col-3" label="Custo mensal sem BDI"><input className="input" type="number" min="0" step="0.01" value={postForm.monthlyCostBeforeBdi} onChange={(event) => setPostForm({ ...postForm, monthlyCostBeforeBdi: event.target.value })} /></Field>
          <Field c="col-3" label="BDI mensal"><input className="input" type="number" min="0" step="0.01" value={postForm.bdiAmount} onChange={(event) => setPostForm({ ...postForm, bdiAmount: event.target.value })} /></Field>
          <Field c="col-3" label="Custo mensal final"><input className="input" type="number" min="0" step="0.01" value={postForm.monthlyCost} onChange={(event) => setPostForm({ ...postForm, monthlyCost: event.target.value })} /></Field>
          <Field c="col-3" label="Custo anual (opcional)"><input className="input" type="number" min="0" step="0.01" placeholder="Calculado automaticamente" value={postForm.annualCost} onChange={(event) => setPostForm({ ...postForm, annualCost: event.target.value })} /></Field>
          <Field c="col-5" label="Convenção/acordo coletivo"><input className="input" value={postForm.collectiveAgreement} onChange={(event) => setPostForm({ ...postForm, collectiveAgreement: event.target.value })} /></Field>
          <Field c="col-4" label="Registro MTE / data-base"><input className="input" value={postForm.mteRegistration} onChange={(event) => setPostForm({ ...postForm, mteRegistration: event.target.value })} /></Field>
        </div>

        <div className={`${styles.componentEditor} ${styles.editor}`}>
          <div className={styles.editorHeader}><div><Plus size={18} /><strong>Composição analítica do custo</strong><span className={styles.counter}>{postComponents.length} componente(s)</span></div></div>
          <p className={styles.editorHint}>Inclua cada parcela do posto: salário, adicionais, benefícios, encargos, uniformes, equipamentos, tributos e outros custos.</p>
          <div className="form-grid">
            <Field c="col-3" label="Módulo"><input className="input" placeholder="Ex.: Módulo 1" value={componentForm.module} onChange={(event) => setComponentForm({ ...componentForm, module: event.target.value })} /></Field>
            <Field c="col-3" label="Submódulo"><input className="input" placeholder="Ex.: Encargos" value={componentForm.submodule} onChange={(event) => setComponentForm({ ...componentForm, submodule: event.target.value })} /></Field>
            <Field c="col-2" label="Código"><input className="input" value={componentForm.code} onChange={(event) => setComponentForm({ ...componentForm, code: event.target.value })} /></Field>
            <Field c="col-4" label="Componente *"><input className="input" value={componentForm.description} onChange={(event) => setComponentForm({ ...componentForm, description: event.target.value })} /></Field>
            <Field c="col-2" label="Percentual (%)"><input className="input" type="number" step="0.000001" value={componentForm.percentage} onChange={(event) => setComponentForm({ ...componentForm, percentage: event.target.value })} /></Field>
            <Field c="col-2" label="Valor (R$) *"><input className="input" type="number" min="0" step="0.01" value={componentForm.amount} onChange={(event) => setComponentForm({ ...componentForm, amount: event.target.value })} /></Field>
            <Field c="col-6" label="Base de cálculo / observação"><input className="input" value={componentForm.basis} onChange={(event) => setComponentForm({ ...componentForm, basis: event.target.value })} /></Field>
            <div className={`field col-2 ${styles.componentAction}`}><button className="btn btn-secondary" type="button" disabled={!componentForm.description.trim()} onClick={saveComponent}>{editingComponentIndex === null ? 'Adicionar componente' : 'Atualizar componente'}</button></div>
          </div>
          {editingComponentIndex !== null ? <button className="btn btn-ghost" type="button" onClick={() => { setComponentForm(emptyComponent); setEditingComponentIndex(null); }}><X size={14} /> Cancelar edição do componente</button> : null}
          <div className="table-wrapper"><table className="data-table"><thead><tr><th>Módulo</th><th>Componente</th><th>Percentual</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
            {postComponents.length ? postComponents.map((component, index) => <tr key={`${component.code}-${component.description}-${index}`}><td>{component.submodule || component.module || '—'}</td><td><span className="table-primary">{component.code ? `${component.code} — ` : ''}{component.description}</span><span className="table-secondary">{component.basis || 'Sem base de cálculo informada'}</span></td><td>{component.percentage ? `${Number(component.percentage).toLocaleString('pt-BR')}%` : '—'}</td><td>{BRL.format(Number(component.amount))}</td><td><div className="table-actions"><button className="btn btn-ghost" type="button" onClick={() => editComponent(index)}><Pencil size={14} /> Editar</button><button className="btn btn-ghost danger-text" type="button" onClick={() => removeComponent(index)}><Trash2 size={14} /> Excluir</button></div></td></tr>) : <tr><td colSpan={5} className={styles.empty}>Nenhum componente cadastrado. O posto pode ser salvo e detalhado posteriormente.</td></tr>}
          </tbody></table></div>
        </div>

        <div className={styles.editorFooter}><label className={styles.checkbox}><input type="checkbox" checked={postForm.includedInTotal} onChange={(event) => setPostForm({ ...postForm, includedInTotal: event.target.checked })} /> Incluir na totalização</label><button className="btn btn-primary" disabled={busy}>{editingPostId ? 'Salvar posto e composição' : 'Cadastrar posto e composição'}</button></div>
      </form> : <div className={styles.guidance}><CircleHelp size={18} /><span>Use <strong>Novo posto de trabalho</strong> para cadastrar o profissional e montar sua composição analítica de custos.</span></div>}
      <div className="table-wrapper"><table className="data-table"><thead><tr><th>Posto / profissional</th><th>Qtd. postos</th><th>Profissionais</th><th>Custo mensal</th><th>Custo anual</th><th>Ações</th></tr></thead><tbody>
        {budget?.laborPosts.length ? budget.laborPosts.map((post) => <PostRows key={post.id} post={post} expanded={expandedPost === post.id} onToggle={() => setExpandedPost((value) => value === post.id ? null : post.id)} onEdit={() => editPost(post)} onDelete={() => void removePost(post)} />) : <tr><td colSpan={6} className={styles.empty}>Nenhum posto de trabalho cadastrado.</td></tr>}
      </tbody></table></div>
    </div> : null}

    {section === 'sinapi' ? <div className={styles.section}>
      <form className={styles.filters} onSubmit={searchSinapi}>
        <select className="select" value={catalogId} onChange={(event) => setCatalogId(event.target.value)}><option value="">Selecione a base SINAPI</option>{catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.state} · {catalog.referenceMonth} · {catalog.version}</option>)}</select>
        <input className="input" placeholder="Código ou descrição, ex.: concretagem" value={sinapiSearch} onChange={(event) => setSinapiSearch(event.target.value)} />
        <button className="btn btn-primary" disabled={busy || !catalogId}><Search size={16} /> Pesquisar SINAPI</button>
      </form>
      <div className="table-wrapper"><table className="data-table"><thead><tr><th>Código / descrição</th><th>Tipo</th><th>Unid.</th><th>Preço</th><th>Ação</th></tr></thead><tbody>{sinapiItems.length ? sinapiItems.map((item) => <tr key={item.id}><td><span className="table-primary">{item.code}</span><span className="table-secondary">{item.description}</span></td><td>{item.type === 'INPUT' ? 'Insumo' : 'Composição'}</td><td>{item.unit}</td><td>{BRL.format(Number(item.unitCost))}</td><td><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void addSinapi(item)}><Plus size={15} /> Adicionar</button></td></tr>) : <tr><td colSpan={5} className={styles.empty}>Pesquise a base para escolher composições e insumos.</td></tr>}</tbody></table></div>
    </div> : null}

  </div>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className={styles.summaryCard}><span>{label}</span><strong>{value}</strong></div>;
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick(): void; icon: React.ReactNode; label: string }) {
  return <button type="button" className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`} onClick={onClick}>{icon}{label}</button>;
}

function Field({ c, label, children }: { c: string; label: string; children: React.ReactNode }) {
  return <div className={`field ${c}`}><label>{label}</label>{children}</div>;
}

function scrollToEditor(className: string) {
  window.setTimeout(() => {
    document.querySelector(`.${className}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

function PostRows({ post, expanded, onToggle, onEdit, onDelete }: {
  post: LaborPost; expanded: boolean; onToggle(): void; onEdit(): void; onDelete(): void;
}) {
  return <>
    <tr><td><button className={styles.postTitle} type="button" onClick={onToggle}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}<span><strong>{post.code} — {post.title}</strong><small>{post.cbo || 'CBO não informado'} · {post.shift || 'jornada não informada'} · {post.components.length} componente(s)</small></span></button></td><td>{Number(post.postQuantity).toLocaleString('pt-BR')}</td><td>{Number(post.professionalQuantity).toLocaleString('pt-BR')}</td><td>{BRL.format(Number(post.monthlyCost))}</td><td>{BRL.format(Number(post.annualCost))}</td><td><div className="table-actions"><button className="btn btn-ghost" type="button" onClick={onEdit}><Pencil size={14} /> Editar</button><button className="btn btn-ghost danger-text" type="button" onClick={onDelete}><Trash2 size={14} /> Excluir</button></div></td></tr>
    {expanded ? <tr className={styles.componentsRow}><td colSpan={6}><div className={styles.components}><div className={styles.componentsHeader}><div><strong>Composição analítica do custo</strong><span>{post.components.length} componente(s) cadastrado(s)</span></div><button className="btn btn-secondary" type="button" onClick={onEdit}><Pencil size={14} /> Editar composição</button></div><table><thead><tr><th>Módulo</th><th>Componente</th><th>Percentual</th><th>Valor</th></tr></thead><tbody>{post.components.length ? post.components.map((component) => <tr key={component.id}><td>{component.submodule || component.module || '—'}</td><td>{component.code ? `${component.code} — ` : ''}{component.description}</td><td>{component.percentage ? `${(Number(component.percentage) * 100).toLocaleString('pt-BR')}%` : '—'}</td><td>{BRL.format(Number(component.amount))}</td></tr>) : <tr><td colSpan={4} className={styles.empty}>Nenhum componente analítico cadastrado.</td></tr>}</tbody></table></div></td></tr> : null}
  </>;
}

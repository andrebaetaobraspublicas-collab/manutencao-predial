'use client';

import { Archive, CalendarDays, CheckSquare2, Clock3, ListTree, Pencil, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import { labelFor, priorityLabels } from '@/lib/labels';
import type { BusinessCalendar, CatalogItem, CatalogKind, Contract, SlaPolicy, WorkOrderPriority } from '@/lib/types';

type Tab = 'catalogs' | 'sla' | 'calendars' | 'checklists';
type FailureHandler = (cause: unknown, fallback: string) => void;

const KIND_LABELS: Record<CatalogKind, string> = {
  CATEGORY: 'Categorias',
  SPECIALTY: 'Especialidades',
  ENVIRONMENT: 'Ambientes',
  CAUSE: 'Causas de falha',
};
const PRIORITIES: WorkOrderPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function OperationalSettingsPage() {
  const [tab, setTab] = useState<Tab>('catalogs');
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [calendars, setCalendars] = useState<BusinessCalendar[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogData, policyData, calendarData, contractData] = await Promise.all([
        apiFetch<CatalogItem[]>('/operations/catalogs?activeOnly=false'),
        apiFetch<SlaPolicy[]>('/operations/sla/policies?activeOnly=false'),
        apiFetch<BusinessCalendar[]>('/operations/sla/calendars?activeOnly=false'),
        apiFetch<Contract[]>('/contracts'),
      ]);
      setCatalogs(catalogData);
      setPolicies(policyData);
      setCalendars(calendarData);
      setContracts(contractData);
      setError('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar a configuração operacional.');
    } finally { setLoading(false); }
  }, []);

  // The initial request intentionally hydrates this client-only administration view.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const notify = useCallback((message: string) => { setSuccess(message); setError(''); }, []);
  const fail = useCallback((cause: unknown, fallback: string) => { setSuccess(''); setError(cause instanceof ApiError ? cause.message : fallback); }, []);

  const categories = useMemo(() => catalogs.filter((item) => item.kind === 'CATEGORY'), [catalogs]);
  if (loading && !catalogs.length && !calendars.length) return <LoadingPanel label="Carregando configuração operacional…" />;

  return <div className="page-container">
    <header className="page-header"><div className="page-title"><h1>Configuração operacional</h1><p>Catálogos, jornadas, regras de SLA, checklists e evidências aplicados às ordens de serviço.</p></div></header>
    <div className="page-tabs settings-tabs" role="tablist" aria-label="Configuração operacional">
      <TabButton active={tab === 'catalogs'} icon={ListTree} label="Catálogos" onClick={() => setTab('catalogs')} />
      <TabButton active={tab === 'sla'} icon={Clock3} label="Regras de SLA" onClick={() => setTab('sla')} />
      <TabButton active={tab === 'calendars'} icon={CalendarDays} label="Calendários" onClick={() => setTab('calendars')} />
      <TabButton active={tab === 'checklists'} icon={CheckSquare2} label="Checklists e evidências" onClick={() => setTab('checklists')} />
    </div>
    {error ? <div className="notice error page-notice">{error}</div> : null}
    {success ? <div className="notice success page-notice">{success}</div> : null}
    {tab === 'catalogs' ? <CatalogSettings items={catalogs} reload={load} notify={notify} fail={fail} /> : null}
    {tab === 'sla' ? <SlaSettings policies={policies} categories={categories} calendars={calendars} contracts={contracts} reload={load} notify={notify} fail={fail} /> : null}
    {tab === 'calendars' ? <CalendarSettings calendars={calendars} reload={load} notify={notify} fail={fail} /> : null}
    {tab === 'checklists' ? <ChecklistSettings categories={categories.filter((item) => item.active)} reload={load} notify={notify} fail={fail} /> : null}
  </div>;
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Settings2; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} role="tab" aria-selected={active} type="button" onClick={onClick}><Icon size={16} /> {label}</button>;
}

type CatalogForm = {
  code: string; name: string; description: string; parentId: string; defaultPriority: WorkOrderPriority;
  requirePhotoBefore: boolean; requirePhotoDuring: boolean; requirePhotoAfter: boolean;
  requireChecklist: boolean; requireFinalCost: boolean; requireAcceptance: boolean;
};
const EMPTY_CATALOG: CatalogForm = { code: '', name: '', description: '', parentId: '', defaultPriority: 'NORMAL', requirePhotoBefore: false, requirePhotoDuring: false, requirePhotoAfter: true, requireChecklist: false, requireFinalCost: false, requireAcceptance: true };

function CatalogSettings({ items, reload, notify, fail }: { items: CatalogItem[]; reload: () => Promise<void>; notify: (message: string) => void; fail: FailureHandler }) {
  const [kind, setKind] = useState<CatalogKind>('CATEGORY');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<CatalogForm>(EMPTY_CATALOG);
  const [saving, setSaving] = useState(false);
  const filtered = items.filter((item) => item.kind === kind);

  function reset(nextKind = kind) { setKind(nextKind); setEditing(null); setForm(EMPTY_CATALOG); }
  function edit(item: CatalogItem) { setKind(item.kind); setEditing(item); setForm({ code: item.code, name: item.name, description: item.description ?? '', parentId: item.parentId ?? '', defaultPriority: item.defaultPriority ?? 'NORMAL', requirePhotoBefore: item.requirePhotoBefore ?? false, requirePhotoDuring: item.requirePhotoDuring ?? false, requirePhotoAfter: item.requirePhotoAfter ?? false, requireChecklist: item.requireChecklist ?? false, requireFinalCost: item.requireFinalCost ?? false, requireAcceptance: item.requireAcceptance ?? false }); }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      await apiFetch(editing ? `/operations/catalogs/${editing.id}` : '/operations/catalogs', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ kind, code: form.code, name: form.name, description: form.description || undefined, parentId: form.parentId || undefined, ...(kind === 'CATEGORY' ? { defaultPriority: form.defaultPriority, requirePhotoBefore: form.requirePhotoBefore, requirePhotoDuring: form.requirePhotoDuring, requirePhotoAfter: form.requirePhotoAfter, requireChecklist: form.requireChecklist, requireFinalCost: form.requireFinalCost, requireAcceptance: form.requireAcceptance } : {}) }),
      });
      notify(editing ? 'Item de catálogo atualizado.' : 'Item de catálogo criado.'); reset(); await reload();
    } catch (cause) { fail(cause, 'Não foi possível salvar o item de catálogo.'); }
    finally { setSaving(false); }
  }

  async function archive(item: CatalogItem) {
    try { await apiFetch(`/operations/catalogs/${item.id}`, { method: 'DELETE' }); notify('Item arquivado; vínculos históricos foram preservados.'); await reload(); }
    catch (cause) { fail(cause, 'Não foi possível arquivar o item.'); }
  }

  return <div className="settings-layout">
    <aside className="card settings-subnav">{(Object.keys(KIND_LABELS) as CatalogKind[]).map((itemKind) => <button className={kind === itemKind ? 'active' : ''} type="button" key={itemKind} onClick={() => reset(itemKind)}><span>{KIND_LABELS[itemKind]}</span><span className="badge neutral">{items.filter((item) => item.kind === itemKind && item.active).length}</span></button>)}</aside>
    <div className="grid">
      <form className="card" onSubmit={submit}><div className="card-header"><div><h2>{editing ? `Editar ${editing.name}` : `Novo item — ${KIND_LABELS[kind]}`}</h2><p>O arquivamento remove o item de novos formulários sem apagar o histórico.</p></div><ListTree size={19} /></div><div className="form-section"><div className="form-grid">
        <div className="field col-3"><label htmlFor="catalogCode">Código</label><input id="catalogCode" className="input" required maxLength={60} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></div>
        <div className="field col-5"><label htmlFor="catalogName">Nome</label><input id="catalogName" className="input" required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="field col-4"><label htmlFor="catalogParent">Item pai</label><select id="catalogParent" className="select" value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}><option value="">Sem item pai</option>{filtered.filter((item) => item.active && item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></div>
        <div className="field col-12"><label htmlFor="catalogDescription">Descrição</label><input id="catalogDescription" className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
        {kind === 'CATEGORY' ? <><div className="field col-3"><label htmlFor="catalogPriority">Prioridade sugerida</label><select id="catalogPriority" className="select" value={form.defaultPriority} onChange={(event) => setForm({ ...form, defaultPriority: event.target.value as WorkOrderPriority })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{labelFor(priority, priorityLabels)}</option>)}</select></div><div className="catalog-requirements col-9"><ToggleField label="Foto antes" checked={form.requirePhotoBefore} onChange={(checked) => setForm({ ...form, requirePhotoBefore: checked })} /><ToggleField label="Foto durante" checked={form.requirePhotoDuring} onChange={(checked) => setForm({ ...form, requirePhotoDuring: checked })} /><ToggleField label="Foto depois" checked={form.requirePhotoAfter} onChange={(checked) => setForm({ ...form, requirePhotoAfter: checked })} /><ToggleField label="Checklist" checked={form.requireChecklist} onChange={(checked) => setForm({ ...form, requireChecklist: checked })} /><ToggleField label="Custo final" checked={form.requireFinalCost} onChange={(checked) => setForm({ ...form, requireFinalCost: checked })} /><ToggleField label="Aceite" checked={form.requireAcceptance} onChange={(checked) => setForm({ ...form, requireAcceptance: checked })} /></div></> : null}
      </div></div><div className="form-footer">{editing ? <button className="btn btn-secondary" type="button" onClick={() => reset()}>Cancelar</button> : null}<button className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Salvando…' : 'Salvar item'}</button></div></form>
      <section className="card table-card">{filtered.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Item</th><th>Configuração</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><span className="table-primary">{item.code} — {item.name}</span><span className="table-secondary">{item.description || 'Sem descrição'}</span></td><td>{item.kind === 'CATEGORY' ? <><span className="table-primary">Prioridade {labelFor(item.defaultPriority ?? 'NORMAL', priorityLabels)}</span><span className="table-secondary">{requirementSummary(item)}</span></> : item.parent?.name ?? '—'}</td><td><span className={`badge ${item.active ? 'success' : 'neutral'}`}>{item.active ? 'Ativo' : 'Inativo'}</span></td><td><div className="table-actions"><button className="btn btn-ghost" type="button" onClick={() => edit(item)}><Pencil size={15} /> Editar</button>{item.active ? <button className="btn btn-ghost" type="button" onClick={() => void archive(item)}><Archive size={15} /> Arquivar</button> : null}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={ListTree} title={`Nenhum item em ${KIND_LABELS[kind].toLowerCase()}`} description="Cadastre o primeiro item para disponibilizá-lo nas ordens de serviço." />}</section>
    </div>
  </div>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="compact-checkbox"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}

function requirementSummary(item: CatalogItem): string {
  const values = [item.requireChecklist && 'checklist', item.requirePhotoBefore && 'foto antes', item.requirePhotoDuring && 'foto durante', item.requirePhotoAfter && 'foto depois', item.requireFinalCost && 'custo final', item.requireAcceptance && 'aceite'].filter(Boolean);
  return values.length ? values.join(' · ') : 'Sem critérios adicionais';
}

type SlaForm = { code: string; name: string; priority: WorkOrderPriority; categoryId: string; contractId: string; calendarId: string; responseMinutes: string; resolutionMinutes: string; warningMinutesBefore: string; active: boolean };

function SlaSettings({ policies, categories, calendars, contracts, reload, notify, fail }: { policies: SlaPolicy[]; categories: CatalogItem[]; calendars: BusinessCalendar[]; contracts: Contract[]; reload: () => Promise<void>; notify: (message: string) => void; fail: FailureHandler }) {
  const makeEmpty = (): SlaForm => ({ code: '', name: '', priority: 'NORMAL', categoryId: '', contractId: '', calendarId: calendars.find((item) => item.active)?.id ?? '', responseMinutes: '480', resolutionMinutes: '4320', warningMinutesBefore: '240', active: true });
  const [editing, setEditing] = useState<SlaPolicy | null>(null);
  const [form, setForm] = useState<SlaForm>(makeEmpty);
  const [saving, setSaving] = useState(false);
  function reset() { setEditing(null); setForm(makeEmpty()); }
  function edit(item: SlaPolicy) { setEditing(item); setForm({ code: item.code, name: item.name, priority: item.priority, categoryId: item.categoryId ?? '', contractId: item.contractId ?? '', calendarId: item.calendarId, responseMinutes: String(item.responseMinutes), resolutionMinutes: String(item.resolutionMinutes), warningMinutesBefore: String(item.warningMinutesBefore ?? 0), active: item.active }); }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await apiFetch(editing ? `/operations/sla/policies/${editing.id}` : '/operations/sla/policies', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ code: form.code, name: form.name, priority: form.priority, categoryId: form.categoryId || (editing ? null : undefined), contractId: form.contractId || (editing ? null : undefined), calendarId: form.calendarId, responseMinutes: Number(form.responseMinutes), resolutionMinutes: Number(form.resolutionMinutes), warningMinutesBefore: Number(form.warningMinutesBefore || 0), active: form.active }) }); notify(editing ? 'Regra de SLA atualizada.' : 'Regra de SLA criada.'); reset(); await reload(); } catch (cause) { fail(cause, 'Não foi possível salvar a regra de SLA.'); } finally { setSaving(false); } }
  return <div className="grid"><div className="notice"><Clock3 size={17} /><span>Precedência: contrato + categoria, contrato, categoria e padrão do tenant. Uma única regra ativa pode existir para cada escopo e prioridade.</span></div><form className="card" onSubmit={submit}><div className="card-header"><div><h2>{editing ? 'Editar regra de SLA' : 'Nova regra de SLA'}</h2><p>Os prazos usam o calendário e os feriados escolhidos.</p></div><Clock3 size={19} /></div><div className="form-section"><div className="form-grid">
    <div className="field col-2"><label htmlFor="slaCode">Código</label><input id="slaCode" className="input" required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></div><div className="field col-4"><label htmlFor="slaName">Nome</label><input id="slaName" className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="field col-2"><label htmlFor="slaPriority">Prioridade</label><select id="slaPriority" className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as WorkOrderPriority })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{labelFor(priority, priorityLabels)}</option>)}</select></div><div className="field col-4"><label htmlFor="slaCalendar">Calendário</label><select id="slaCalendar" className="select" required value={form.calendarId} onChange={(event) => setForm({ ...form, calendarId: event.target.value })}><option value="">Selecione</option>{calendars.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></div>
    <div className="field col-3"><label htmlFor="slaCategory">Categoria</label><select id="slaCategory" className="select" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Todas</option>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="field col-3"><label htmlFor="slaContract">Contrato</label><select id="slaContract" className="select" value={form.contractId} onChange={(event) => setForm({ ...form, contractId: event.target.value })}><option value="">Todos</option>{contracts.filter((item) => ['ACTIVE', 'EXPIRING'].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select></div><div className="field col-2"><label htmlFor="slaResponse">Resposta (min)</label><input id="slaResponse" className="input" type="number" min="1" required value={form.responseMinutes} onChange={(event) => setForm({ ...form, responseMinutes: event.target.value })} /></div><div className="field col-2"><label htmlFor="slaResolution">Resolução (min)</label><input id="slaResolution" className="input" type="number" min="1" required value={form.resolutionMinutes} onChange={(event) => setForm({ ...form, resolutionMinutes: event.target.value })} /></div><div className="field col-2"><label htmlFor="slaWarning">Alerta antes (min)</label><input id="slaWarning" className="input" type="number" min="0" value={form.warningMinutesBefore} onChange={(event) => setForm({ ...form, warningMinutesBefore: event.target.value })} /></div><label className="checkbox-field col-3"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span><strong>Regra ativa</strong></span></label>
  </div></div><div className="form-footer">{editing ? <button className="btn btn-secondary" type="button" onClick={reset}>Cancelar</button> : null}<button className="btn btn-primary" disabled={saving || !form.calendarId}><Save size={16} /> {saving ? 'Salvando…' : 'Salvar regra'}</button></div></form>
  <section className="card table-card">{policies.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Regra</th><th>Escopo</th><th>Prazos</th><th>Calendário</th><th>Situação</th><th></th></tr></thead><tbody>{policies.map((item) => <tr key={item.id}><td><span className="table-primary">{item.code} — {item.name}</span><span className="table-secondary">{labelFor(item.priority, priorityLabels)}</span></td><td><span className="table-primary">{item.contract?.code ?? 'Todos os contratos'}</span><span className="table-secondary">{item.category?.name ?? 'Todas as categorias'}</span></td><td><span className="table-primary">Resposta: {formatMinutes(item.responseMinutes)}</span><span className="table-secondary">Resolução: {formatMinutes(item.resolutionMinutes)}</span></td><td>{item.calendar?.name ?? calendars.find((calendar) => calendar.id === item.calendarId)?.name ?? '—'}</td><td><span className={`badge ${item.active ? 'success' : 'neutral'}`}>{item.active ? 'Ativa' : 'Inativa'}</span></td><td><button className="btn btn-ghost" type="button" onClick={() => edit(item)}><Pencil size={15} /> Editar</button></td></tr>)}</tbody></table></div> : <EmptyState icon={Clock3} title="Nenhuma regra de SLA" description="Crie uma regra padrão por prioridade antes de emitir novas ordens." />}</section></div>;
}

type CalendarShift = { days: number[]; start: string; end: string };
type CalendarForm = {
  code: string;
  name: string;
  timezone: string;
  timeMode: 'CALENDAR' | 'BUSINESS';
  businessDays: number[];
  workdayStart: string;
  workdayEnd: string;
  shifts: CalendarShift[];
  active: boolean;
};

function CalendarSettings({ calendars, reload, notify, fail }: { calendars: BusinessCalendar[]; reload: () => Promise<void>; notify: (message: string) => void; fail: FailureHandler }) {
  const [selected, setSelected] = useState<BusinessCalendar | null>(calendars[0] ?? null);
  const [form, setForm] = useState<CalendarForm>(calendarToForm(calendars[0] ?? null));
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const [saving, setSaving] = useState(false);
  const businessScheduleValid = form.timeMode === 'CALENDAR' || (
    form.shifts.length > 0 && form.shifts.every((shift) => shift.days.length > 0 && shift.start < shift.end)
  );

  function select(calendar: BusinessCalendar | null) {
    setSelected(calendar);
    setForm(calendarToForm(calendar));
  }

  function updateShift(index: number, value: Partial<CalendarShift>) {
    setForm((current) => ({
      ...current,
      shifts: current.shifts.map((shift, shiftIndex) => shiftIndex === index ? { ...shift, ...value } : shift),
    }));
  }

  function toggleShiftDay(index: number, weekday: number, checked: boolean) {
    const shift = form.shifts[index];
    const days = checked
      ? [...new Set([...shift.days, weekday])].sort((left, right) => left - right)
      : shift.days.filter((day) => day !== weekday);
    updateShift(index, { days });
  }

  function addShift() {
    setForm((current) => ({
      ...current,
      shifts: [...current.shifts, { days: current.shifts[0]?.days ?? [1, 2, 3, 4, 5], start: '13:00', end: '17:00' }],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!businessScheduleValid) return;
    setSaving(true);
    try {
      const activeShifts = form.timeMode === 'BUSINESS' ? form.shifts : [];
      const legacy = legacyWindow(activeShifts, form);
      await apiFetch(selected ? `/operations/sla/calendars/${selected.id}` : '/operations/sla/calendars', {
        method: selected ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, shifts: activeShifts, businessDays: legacy.days, workdayStart: legacy.start, workdayEnd: legacy.end }),
      });
      notify(selected ? 'Calendário e turnos atualizados.' : 'Calendário criado.');
      await reload();
    } catch (cause) {
      fail(cause, 'Não foi possível salvar o calendário.');
    } finally {
      setSaving(false);
    }
  }

  async function addHoliday(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/operations/sla/calendars/${selected.id}/holidays`, { method: 'POST', body: JSON.stringify(holiday) });
      setHoliday({ date: '', name: '' });
      notify('Feriado adicionado.');
      await reload();
    } catch (cause) {
      fail(cause, 'Não foi possível adicionar o feriado.');
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday(id?: string) {
    if (!selected || !id) return;
    try {
      await apiFetch(`/operations/sla/calendars/${selected.id}/holidays/${id}`, { method: 'DELETE' });
      notify('Feriado removido.');
      await reload();
    } catch (cause) {
      fail(cause, 'Não foi possível remover o feriado.');
    }
  }

  const current = calendars.find((item) => item.id === selected?.id) ?? selected;
  return <div className="settings-layout">
    <aside className="card settings-subnav"><button className={!selected ? 'active' : ''} type="button" onClick={() => select(null)}><Plus size={15} /> Novo calendário</button>{calendars.map((calendar) => <button className={selected?.id === calendar.id ? 'active' : ''} type="button" key={calendar.id} onClick={() => select(calendar)}><span>{calendar.name}</span><span className={`badge ${calendar.active ? 'success' : 'neutral'}`}>{calendar.timeMode === 'BUSINESS' ? 'útil' : 'corrido'}</span></button>)}</aside>
    <div className="grid">
      <form className="card" onSubmit={submit}>
        <div className="card-header"><div><h2>{selected ? selected.name : 'Novo calendário'}</h2><p>Modo corrido conta 24 horas; modo útil respeita turnos, fuso e feriados.</p></div><CalendarDays size={19} /></div>
        <div className="form-section">
          <div className="form-grid"><div className="field col-2"><label htmlFor="calendarCode">Código</label><input id="calendarCode" className="input" required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></div><div className="field col-4"><label htmlFor="calendarName">Nome</label><input id="calendarName" className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="field col-3"><label htmlFor="calendarTimezone">Fuso</label><input id="calendarTimezone" className="input" required value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></div><div className="field col-3"><label htmlFor="calendarMode">Contagem</label><select id="calendarMode" className="select" value={form.timeMode} onChange={(event) => setForm({ ...form, timeMode: event.target.value as CalendarForm['timeMode'] })}><option value="CALENDAR">Horas corridas</option><option value="BUSINESS">Horas úteis</option></select></div><label className="checkbox-field col-3"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span><strong>Calendário ativo</strong><small>Disponível para novas regras de SLA.</small></span></label></div>
          {form.timeMode === 'BUSINESS' ? <div className="business-calendar-editor">
            <div className="shift-editor-header"><div><strong>Turnos de atendimento</strong><span>Cadastre intervalos separados para almoço, plantões ou jornadas diferentes.</span></div><button className="btn btn-secondary" type="button" onClick={addShift}><Plus size={15} /> Adicionar turno</button></div>
            <div className="shift-list">{form.shifts.map((shift, index) => <article className="shift-editor" key={index}>
              <div className="shift-title"><strong>Turno {index + 1}</strong><button className="icon-button" type="button" aria-label={`Remover turno ${index + 1}`} onClick={() => setForm((current) => ({ ...current, shifts: current.shifts.filter((_, shiftIndex) => shiftIndex !== index) }))}><Trash2 size={15} /></button></div>
              <div className="weekday-picker">{WEEKDAYS.map((label, weekday) => <label className={shift.days.includes(weekday) ? 'active' : ''} key={label}><input type="checkbox" checked={shift.days.includes(weekday)} onChange={(event) => toggleShiftDay(index, weekday, event.target.checked)} />{label.slice(0, 3)}</label>)}</div>
              <div className="shift-times"><div className="field"><label htmlFor={`shiftStart-${index}`}>Início</label><input id={`shiftStart-${index}`} className="input" type="time" required value={shift.start} onChange={(event) => updateShift(index, { start: event.target.value })} /></div><div className="field"><label htmlFor={`shiftEnd-${index}`}>Fim</label><input id={`shiftEnd-${index}`} className="input" type="time" required value={shift.end} onChange={(event) => updateShift(index, { end: event.target.value })} /></div></div>
            </article>)}</div>
            {!businessScheduleValid ? <div className="notice warning">Cada turno deve possuir ao menos um dia e terminar depois do horário de início.</div> : null}
          </div> : null}
        </div>
        <div className="form-footer"><button className="btn btn-primary" disabled={saving || !businessScheduleValid}><Save size={16} /> {saving ? 'Salvando…' : 'Salvar calendário'}</button></div>
      </form>
      {selected ? <section className="card"><div className="card-header"><div><h2>Feriados e exceções</h2><p>Datas sem expediente no calendário.</p></div></div><div className="card-body"><form className="holiday-form" onSubmit={addHoliday}><div className="field"><label htmlFor="holidayDate">Data</label><input id="holidayDate" className="input" type="date" required value={holiday.date} onChange={(event) => setHoliday({ ...holiday, date: event.target.value })} /></div><div className="field"><label htmlFor="holidayName">Descrição</label><input id="holidayName" className="input" required value={holiday.name} onChange={(event) => setHoliday({ ...holiday, name: event.target.value })} /></div><button className="btn btn-secondary" disabled={saving}><Plus size={16} /> Adicionar</button></form><div className="holiday-list">{current?.holidays.map((item) => <div key={item.id ?? item.date}><span><strong>{new Date(item.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong><small>{item.name}</small></span><button className="icon-button" aria-label={`Remover ${item.name}`} type="button" disabled={!item.id} onClick={() => void removeHoliday(item.id)}><Trash2 size={15} /></button></div>)}{!current?.holidays.length ? <p className="table-secondary">Nenhum feriado cadastrado.</p> : null}</div></div></section> : null}
    </div>
  </div>;
}

function calendarToForm(calendar: BusinessCalendar | null): CalendarForm {
  const businessDays = Array.isArray(calendar?.businessDays) && calendar.businessDays.length ? calendar.businessDays : [1, 2, 3, 4, 5];
  const workdayStart = calendar?.workdayStart ?? '08:00';
  const workdayEnd = calendar?.workdayEnd ?? '18:00';
  const shifts = Array.isArray(calendar?.shifts) && calendar.shifts.length
    ? calendar.shifts.map((shift) => ({ days: [...shift.days], start: shift.start, end: shift.end }))
    : [{ days: [...businessDays], start: workdayStart, end: workdayEnd }];
  return { code: calendar?.code ?? '', name: calendar?.name ?? '', timezone: calendar?.timezone ?? 'America/Sao_Paulo', timeMode: calendar?.timeMode ?? 'BUSINESS', businessDays, workdayStart, workdayEnd, shifts, active: calendar?.active ?? true };
}

function legacyWindow(shifts: CalendarShift[], fallback: Pick<CalendarForm, 'businessDays' | 'workdayStart' | 'workdayEnd'>) {
  if (!shifts.length) return { days: fallback.businessDays, start: fallback.workdayStart, end: fallback.workdayEnd };
  return {
    days: [...new Set(shifts.flatMap((shift) => shift.days))].sort((left, right) => left - right),
    start: shifts.map((shift) => shift.start).sort()[0],
    end: shifts.map((shift) => shift.end).sort().at(-1) ?? fallback.workdayEnd,
  };
}

type TemplateApi = { category: { id: string; code: string; name: string; requireChecklist: boolean }; items: Array<{ id: string; label: string; description?: string | null; required: boolean; sortOrder: number }> };
type DraftChecklistItem = { key: string; label: string; description: string; required: boolean };
function ChecklistSettings({ categories, reload, notify, fail }: { categories: CatalogItem[]; reload: () => Promise<void>; notify: (message: string) => void; fail: FailureHandler }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [items, setItems] = useState<DraftChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const category = categories.find((item) => item.id === categoryId);
  const [requirements, setRequirements] = useState({ requireChecklist: category?.requireChecklist ?? false, requirePhotoBefore: category?.requirePhotoBefore ?? false, requirePhotoDuring: category?.requirePhotoDuring ?? false, requirePhotoAfter: category?.requirePhotoAfter ?? false, requireFinalCost: category?.requireFinalCost ?? false, requireAcceptance: category?.requireAcceptance ?? false });

  const loadTemplate = useCallback(async (id: string) => {
    if (!id) return; setLoading(true);
    try { const data = await apiFetch<TemplateApi>(`/operations/catalogs/${id}/checklist-template`); setItems(data.items.map((item) => ({ key: item.id, label: item.label, description: item.description ?? '', required: item.required }))); const selected = categories.find((item) => item.id === id); setRequirements({ requireChecklist: selected?.requireChecklist ?? data.category.requireChecklist, requirePhotoBefore: selected?.requirePhotoBefore ?? false, requirePhotoDuring: selected?.requirePhotoDuring ?? false, requirePhotoAfter: selected?.requirePhotoAfter ?? false, requireFinalCost: selected?.requireFinalCost ?? false, requireAcceptance: selected?.requireAcceptance ?? false }); }
    catch (cause) { fail(cause, 'Não foi possível carregar o checklist.'); }
    finally { setLoading(false); }
  }, [categories, fail]);
  // Selecting a category hydrates its server-owned checklist template.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadTemplate(categoryId); }, [categoryId, loadTemplate]);
  async function save() { if (!categoryId) return; setSaving(true); try { await apiFetch(`/operations/catalogs/${categoryId}`, { method: 'PATCH', body: JSON.stringify(requirements) }); await apiFetch(`/operations/catalogs/${categoryId}/checklist-template`, { method: 'PUT', body: JSON.stringify({ items: items.map((item, sortOrder) => ({ label: item.label, description: item.description || undefined, required: item.required, sortOrder })) }) }); notify('Checklist e critérios de fechamento publicados. Respostas históricas permanecem imutáveis.'); await reload(); } catch (cause) { fail(cause, 'Não foi possível publicar o checklist.'); } finally { setSaving(false); } }
  if (!categories.length) return <EmptyState icon={CheckSquare2} title="Cadastre uma categoria primeiro" description="Cada checklist é vinculado a uma categoria de ordem de serviço." />;
  return <div className="grid"><section className="card"><div className="card-header"><div><h2>Checklist por categoria</h2><p>Ao publicar, as próximas OS recebem o modelo atualizado; respostas anteriores não são alteradas.</p></div></div><div className="form-section"><div className="field"><label htmlFor="checklistCategory">Categoria</label><select id="checklistCategory" className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></div></div></section>{loading ? <LoadingPanel label="Carregando checklist…" /> : <><section className="card checklist-builder"><div className="card-header"><div><h2>Itens de verificação</h2><p>Uma nova resposta é registrada a cada alteração durante a execução.</p></div><button className="btn btn-secondary" type="button" onClick={() => setItems((current) => [...current, { key: crypto.randomUUID(), label: '', description: '', required: true }])}><Plus size={16} /> Adicionar item</button></div><div className="card-body">{items.map((item, index) => <div className="checklist-builder-item simple" key={item.key}><span>{index + 1}</span><input className="input" aria-label={`Item ${index + 1}`} value={item.label} onChange={(event) => setItems((current) => current.map((currentItem) => currentItem.key === item.key ? { ...currentItem, label: event.target.value } : currentItem))} placeholder="O que deve ser verificado?" /><input className="input" aria-label={`Descrição do item ${index + 1}`} value={item.description} onChange={(event) => setItems((current) => current.map((currentItem) => currentItem.key === item.key ? { ...currentItem, description: event.target.value } : currentItem))} placeholder="Orientação opcional" /><label className="compact-checkbox"><input type="checkbox" checked={item.required} onChange={(event) => setItems((current) => current.map((currentItem) => currentItem.key === item.key ? { ...currentItem, required: event.target.checked } : currentItem))} /> Obrigatório</label><button className="icon-button" type="button" aria-label="Remover item" onClick={() => setItems((current) => current.filter((currentItem) => currentItem.key !== item.key))}><Trash2 size={15} /></button></div>)}{!items.length ? <p className="table-secondary">Nenhum item. Adicione verificações ou deixe o checklist desativado.</p> : null}</div></section>
  <section className="card"><div className="card-header"><div><h2>Critérios de conclusão e fechamento</h2><p>O servidor bloqueia o fechamento enquanto algum critério obrigatório não for atendido.</p></div></div><div className="form-section catalog-requirements large"><ToggleField label="Checklist obrigatório" checked={requirements.requireChecklist} onChange={(checked) => setRequirements({ ...requirements, requireChecklist: checked })} /><ToggleField label="Foto antes" checked={requirements.requirePhotoBefore} onChange={(checked) => setRequirements({ ...requirements, requirePhotoBefore: checked })} /><ToggleField label="Foto durante" checked={requirements.requirePhotoDuring} onChange={(checked) => setRequirements({ ...requirements, requirePhotoDuring: checked })} /><ToggleField label="Foto depois" checked={requirements.requirePhotoAfter} onChange={(checked) => setRequirements({ ...requirements, requirePhotoAfter: checked })} /><ToggleField label="Custo final" checked={requirements.requireFinalCost} onChange={(checked) => setRequirements({ ...requirements, requireFinalCost: checked })} /><ToggleField label="Aceite" checked={requirements.requireAcceptance} onChange={(checked) => setRequirements({ ...requirements, requireAcceptance: checked })} /></div><div className="form-footer"><button className="btn btn-primary" type="button" disabled={saving || (requirements.requireChecklist && !items.length) || items.some((item) => item.label.trim().length < 2)} onClick={() => void save()}><Save size={16} /> {saving ? 'Publicando…' : 'Publicar configuração'}</button></div></section></>}</div>;
}

function formatMinutes(minutes: number): string { if (minutes < 60) return `${minutes} min`; if (minutes % 60 === 0) return `${minutes / 60} h`; return `${Math.floor(minutes / 60)} h ${minutes % 60} min`; }

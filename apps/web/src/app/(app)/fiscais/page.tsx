'use client';

import { Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import { BRL } from '@/lib/format';
import type {
  CurrentSession,
  InspectorProfile,
  TenantDirectoryMember,
} from '@/lib/types';

const EMPTY = {
  userId: '',
  name: '',
  registrationNumber: '',
  cpf: '',
  jobTitle: 'Fiscal técnico',
  professionalEducation: '',
  professionalCouncil: '',
  department: '',
  phone: '',
  email: '',
  specialty: 'Edificações',
  status: 'ACTIVE',
  availableHours: '40',
  maxProcesses: '8',
  baseLatitude: '',
  baseLongitude: '',
  restrictedCompanies: '',
  designationOrdinance: '',
  notes: '',
};

export default function InspectorsPage() {
  const [items, setItems] = useState<InspectorProfile[]>([]);
  const [members, setMembers] = useState<TenantDirectoryMember[]>([]);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [profiles, directory, current] = await Promise.all([
        apiFetch<InspectorProfile[]>('/inspectors'),
        apiFetch<TenantDirectoryMember[]>('/members/directory'),
        apiFetch<CurrentSession>('/auth/me'),
      ]);
      setItems(profiles);
      setMembers(directory);
      setSession(current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar fiscais.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        userId: form.userId || undefined,
        cpf: form.cpf || undefined,
        professionalEducation: form.professionalEducation || undefined,
        professionalCouncil: form.professionalCouncil || undefined,
        department: form.department || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        availableHours: Number(form.availableHours),
        maxProcesses: Number(form.maxProcesses),
        baseLatitude: form.baseLatitude ? Number(form.baseLatitude) : undefined,
        baseLongitude: form.baseLongitude ? Number(form.baseLongitude) : undefined,
        restrictedCompanies: form.restrictedCompanies || undefined,
        designationOrdinance: form.designationOrdinance || undefined,
        notes: form.notes || undefined,
      };
      await apiFetch(editingId ? `/inspectors/${editingId}` : '/inspectors', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setForm(EMPTY);
      setEditingId(null);
      setShowForm(false);
      setLoading(true);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar o fiscal.');
    } finally {
      setSubmitting(false);
    }
  }

  function edit(item: InspectorProfile) {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      userId: item.userId ?? '',
      name: item.name,
      registrationNumber: item.registrationNumber,
      cpf: item.cpf ?? '',
      jobTitle: item.jobTitle,
      professionalEducation: item.professionalEducation ?? '',
      professionalCouncil: item.professionalCouncil ?? '',
      department: item.department ?? '',
      phone: item.phone ?? '',
      email: item.email ?? '',
      specialty: item.specialty,
      status: item.status,
      availableHours: String(item.availableHours),
      maxProcesses: String(item.maxProcesses),
      baseLatitude: item.baseLatitude == null ? '' : String(item.baseLatitude),
      baseLongitude: item.baseLongitude == null ? '' : String(item.baseLongitude),
      restrictedCompanies: item.restrictedCompanies ?? '',
      designationOrdinance: item.designationOrdinance ?? '',
      notes: item.notes ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function archive(item: InspectorProfile) {
    if (!window.confirm(`Excluir o fiscal ${item.name}? O histórico de designações será preservado.`)) return;
    setError('');
    try {
      await apiFetch(`/inspectors/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível excluir o fiscal.');
    }
  }

  const canDelete = Boolean(session && ['OWNER', 'ADMIN'].includes(session.role));

  return <div className="page-container">
    <header className="page-header">
      <div className="page-title">
        <h1>Fiscais</h1>
        <p>Cadastro, especialidades, disponibilidade, carga de contratos e designações da fiscalização.</p>
      </div>
      <button className="btn btn-primary" type="button" onClick={() => {
        if (showForm) { setForm(EMPTY); setEditingId(null); }
        setShowForm((value) => !value);
      }}>
        {showForm ? <X size={16} /> : <Plus size={16} />}
        {showForm ? 'Fechar cadastro' : 'Novo fiscal'}
      </button>
    </header>

    {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}

    {showForm ? <form className="card form-card" onSubmit={submit} style={{ marginBottom: 18 }}>
      <section className="form-section">
        <div className="form-section-header">
          <h2>{editingId ? 'Editar fiscal' : 'Cadastro de fiscal'}</h2>
          <p>O vínculo com um usuário é opcional; matrícula e especialidade identificam o perfil de fiscalização.</p>
        </div>
        <div className="form-grid">
          <Field c="col-4" label="Usuário do sistema">
            <select className="select" value={form.userId} onChange={(e) => {
              const member = members.find((candidate) => candidate.user.id === e.target.value);
              setForm((current) => ({ ...current, userId: e.target.value,
                name: current.name || member?.user.name || '', email: current.email || member?.user.email || '' }));
            }}><option value="">Sem vínculo de acesso</option>{members.map((item) =>
              <option key={item.user.id} value={item.user.id}>{item.user.name} — {item.role}</option>)}</select>
          </Field>
          <Field c="col-4" label="Nome *"><input className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} /></Field>
          <Field c="col-2" label="Matrícula *"><input className="input" required value={form.registrationNumber} onChange={(e) => update('registrationNumber', e.target.value)} /></Field>
          <Field c="col-2" label="CPF"><input className="input" value={form.cpf} onChange={(e) => update('cpf', e.target.value)} /></Field>
          <Field c="col-3" label="Cargo *"><input className="input" required value={form.jobTitle} onChange={(e) => update('jobTitle', e.target.value)} /></Field>
          <Field c="col-3" label="Formação profissional"><select className="select" value={form.professionalEducation} onChange={(e) => update('professionalEducation', e.target.value)}><option value="">Selecione</option><option>Engenharia Civil</option><option>Arquitetura e Urbanismo</option><option>Engenharia Sanitária</option><option>Engenharia Elétrica</option><option>Técnico em Edificações</option><option>Administração</option><option>Direito</option><option>Outra</option></select></Field>
          <Field c="col-2" label="CREA/CAU"><input className="input" value={form.professionalCouncil} onChange={(e) => update('professionalCouncil', e.target.value)} /></Field>
          <Field c="col-4" label="Secretaria/departamento"><input className="input" value={form.department} onChange={(e) => update('department', e.target.value)} /></Field>
          <Field c="col-3" label="Especialidade *"><select className="select" value={form.specialty} onChange={(e) => update('specialty', e.target.value)}><option>Edificações</option><option>Instalações elétricas</option><option>Instalações hidrossanitárias</option><option>Climatização</option><option>Prevenção e combate a incêndio</option><option>Fiscalização administrativa</option><option>Fiscalização geral</option></select></Field>
          <Field c="col-2" label="Status"><select className="select" value={form.status} onChange={(e) => update('status', e.target.value)}><option value="ACTIVE">Ativo</option><option value="LEAVE">Afastado/férias</option><option value="SUSPENDED">Suspenso</option><option value="INACTIVE">Inativo</option></select></Field>
          <Field c="col-2" label="Carga disponível (h)"><input className="input" min="1" max="168" type="number" value={form.availableHours} onChange={(e) => update('availableHours', e.target.value)} /></Field>
          <Field c="col-2" label="Limite de processos"><input className="input" min="1" type="number" value={form.maxProcesses} onChange={(e) => update('maxProcesses', e.target.value)} /></Field>
          <Field c="col-3" label="E-mail"><input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></Field>
          <Field c="col-2" label="Telefone"><input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></Field>
          <Field c="col-2" label="Latitude-base"><input className="input" type="number" step="0.0000001" value={form.baseLatitude} onChange={(e) => update('baseLatitude', e.target.value)} /></Field>
          <Field c="col-2" label="Longitude-base"><input className="input" type="number" step="0.0000001" value={form.baseLongitude} onChange={(e) => update('baseLongitude', e.target.value)} /></Field>
          <Field c="col-6" label="Empresas impedidas/suspeição"><input className="input" placeholder="CNPJ ou razões sociais, separados por ;" value={form.restrictedCompanies} onChange={(e) => update('restrictedCompanies', e.target.value)} /></Field>
          <Field c="col-6" label="Portaria de designação"><input className="input" value={form.designationOrdinance} onChange={(e) => update('designationOrdinance', e.target.value)} /></Field>
          <Field c="col-12" label="Observações"><textarea className="textarea" value={form.notes} onChange={(e) => update('notes', e.target.value)} /></Field>
        </div>
      </section>
      <div className="form-footer"><button type="button" className="btn btn-secondary" onClick={() => { setForm(EMPTY); setEditingId(null); setShowForm(false); }}>Cancelar</button><button className="btn btn-primary" disabled={submitting}><Save size={16} /> {submitting ? 'Salvando…' : 'Salvar fiscal'}</button></div>
    </form> : null}

    {loading ? <LoadingPanel /> : <section className="card table-card">
      {items.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Fiscal</th><th>Especialidade</th><th>Status</th><th>Carga contratual</th><th>Valor fiscalizado</th><th>Ações</th></tr></thead><tbody>{items.map((item) => {
        const assigned = item.activeAssignments ?? 0;
        const loadPercent = Math.min(100, (assigned / Math.max(1, item.maxProcesses)) * 100);
        return <tr key={item.id}><td><span className="table-primary">{item.name}</span><span className="table-secondary">{item.registrationNumber}{item.professionalCouncil ? ` · ${item.professionalCouncil}` : ''}</span></td><td>{item.specialty}</td><td><span className={`badge ${item.status === 'ACTIVE' ? 'success' : 'warning'}`}>{statusLabel(item.status)}</span></td><td><span className="table-primary">{assigned}/{item.maxProcesses} processo(s)</span><span className="table-secondary">{Math.round(loadPercent)}% do limite</span></td><td>{BRL.format(Number(item.assignedContractValue ?? 0))}</td><td><div className="table-actions"><button type="button" className="btn btn-ghost" onClick={() => edit(item)}><Pencil size={15} /> Editar</button>{canDelete ? <button type="button" className="btn btn-ghost danger-text" onClick={() => void archive(item)}><Trash2 size={15} /> Excluir</button> : null}</div></td></tr>;
      })}</tbody></table></div> : <EmptyState icon={ShieldCheck} title="Nenhum fiscal cadastrado" description="Cadastre gestores e fiscais para compor as equipes dos contratos." />}
    </section>}
  </div>;
}

function statusLabel(value: string) {
  return ({ ACTIVE: 'Ativo', LEAVE: 'Afastado/férias', SUSPENDED: 'Suspenso', INACTIVE: 'Inativo' } as Record<string, string>)[value] ?? value;
}

function Field({ c, label, children }: { c: string; label: string; children: React.ReactNode }) {
  return <div className={`field ${c}`}><label>{label}</label>{children}</div>;
}

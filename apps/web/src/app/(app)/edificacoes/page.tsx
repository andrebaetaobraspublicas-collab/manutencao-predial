'use client';

import { Building2, MapPin, Plus, Save, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import type { Building } from '@/lib/types';

const EMPTY_FORM = {
  code: '', name: '', type: '', addressLine1: '', addressLine2: '', district: '', city: '', state: '', postalCode: '', latitude: '', longitude: '', grossAreaM2: '', constructionYear: '', floors: '',
};

export default function BuildingsPage() {
  const [items, setItems] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch<Building[]>('/buildings').then(setItems).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError('');
    try {
      await apiFetch('/buildings', { method: 'POST', body: JSON.stringify({
        code: form.code, name: form.name, type: form.type || undefined,
        addressLine1: form.addressLine1, addressLine2: form.addressLine2 || undefined,
        district: form.district || undefined, city: form.city, state: form.state, postalCode: form.postalCode,
        latitude: form.latitude ? Number(form.latitude) : undefined, longitude: form.longitude ? Number(form.longitude) : undefined,
        grossAreaM2: form.grossAreaM2 ? Number(form.grossAreaM2) : undefined,
        constructionYear: form.constructionYear ? Number(form.constructionYear) : undefined,
        floors: form.floors ? Number(form.floors) : undefined,
      }) });
      setForm(EMPTY_FORM); setShowForm(false); setLoading(true); load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Não foi possível cadastrar a edificação.'); }
    finally { setSubmitting(false); }
  }

  return <div className="page-container">
    <header className="page-header"><div className="page-title"><h1>Edificações</h1><p>Cadastro patrimonial dos imóveis, endereços, coordenadas geográficas e volume de ordens de serviço.</p></div><button className="btn btn-primary" type="button" onClick={() => setShowForm((value) => !value)}>{showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? 'Fechar cadastro' : 'Nova edificação'}</button></header>
    {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}
    {showForm ? <form className="card form-card" onSubmit={submit} style={{ marginBottom: 18 }}>
      <section className="form-section"><div className="form-section-header"><h2>Identificação e localização</h2><p>As coordenadas permitem a exibição imediata no mapa. A geocodificação automática está prevista no roadmap do MVP.</p></div><div className="form-grid">
        <Field col="col-3" label="Código *"><input className="input" required maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field col="col-6" label="Nome *"><input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field col="col-3" label="Tipo"><input className="input" placeholder="Administrativo, hospital…" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Field>
        <Field col="col-8" label="Endereço *"><input className="input" required value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></Field>
        <Field col="col-4" label="Complemento"><input className="input" value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} /></Field>
        <Field col="col-3" label="Bairro"><input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Field>
        <Field col="col-4" label="Município *"><input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        <Field col="col-2" label="UF *"><input className="input" required minLength={2} maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></Field>
        <Field col="col-3" label="CEP *"><input className="input" required value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field>
        <Field col="col-3" label="Latitude"><input className="input" type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></Field>
        <Field col="col-3" label="Longitude"><input className="input" type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></Field>
        <Field col="col-2" label="Área (m²)"><input className="input" type="number" min="0" step="0.01" value={form.grossAreaM2} onChange={(e) => setForm({ ...form, grossAreaM2: e.target.value })} /></Field>
        <Field col="col-2" label="Ano"><input className="input" type="number" min="1800" max="2200" value={form.constructionYear} onChange={(e) => setForm({ ...form, constructionYear: e.target.value })} /></Field>
        <Field col="col-2" label="Pavimentos"><input className="input" type="number" min="1" value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} /></Field>
      </div></section><div className="form-footer"><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={submitting}><Save size={16} /> {submitting ? 'Salvando…' : 'Salvar edificação'}</button></div>
    </form> : null}
    {loading ? <LoadingPanel /> : <section className="card table-card">{items.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Edificação</th><th>Endereço</th><th>Tipo</th><th>Área</th><th>Georreferência</th><th>OS</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="table-primary">{item.code} — {item.name}</span><span className="table-secondary">Status: {item.status.toLowerCase()}</span></td><td><span className="table-primary">{item.addressLine1}</span><span className="table-secondary">{item.city}/{item.state} · {item.postalCode}</span></td><td>{item.type || '—'}</td><td>{item.grossAreaM2 ? `${Number(item.grossAreaM2).toLocaleString('pt-BR')} m²` : '—'}</td><td>{item.latitude && item.longitude ? <span className="badge success"><MapPin size={13} /> mapeada</span> : <span className="badge warning">sem coordenadas</span>}</td><td><span className="badge neutral">{item._count?.workOrders ?? 0}</span></td></tr>)}</tbody></table></div> : <EmptyState icon={Building2} title="Nenhuma edificação cadastrada" description="Cadastre o primeiro imóvel para começar a registrar contratos, planos e ordens de serviço." />}</section>}
  </div>;
}

function Field({ col, label, children }: { col: string; label: string; children: React.ReactNode }) { return <div className={`field ${col}`}><label>{label}</label>{children}</div>; }

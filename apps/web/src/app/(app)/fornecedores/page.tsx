'use client';

import { Plus, Save, ShieldAlert, UsersRound, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import type { CatalogItem, Supplier } from '@/lib/types';

const EMPTY = { kind: 'COMPANY', legalName: '', tradeName: '', taxId: '', email: '', phone: '', contactName: '',
  addressLine1: '', addressLine2: '', district: '', city: '', state: '', postalCode: '', notes: '',
  serviceAreaCategoryIds: [] as string[], memberIds: [] as string[] };
const EMPTY_PENALTY = { type: 'WARNING', administrativeCase: '', description: '', amount: '', appliedAt: '' };

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([]); const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState(EMPTY); const [penalty, setPenalty] = useState(EMPTY_PENALTY);
  const [selected, setSelected] = useState<Supplier | null>(null); const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { try { const [suppliers, catalog] = await Promise.all([
    apiFetch<Supplier[]>('/suppliers'), apiFetch<CatalogItem[]>('/operations/catalogs?kind=CATEGORY&active=true')]);
    setItems(suppliers); setCategories(catalog); setSelected((current) => current ? suppliers.find((item) => item.id === current.id) ?? null : null);
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar fornecedores.'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) { event.preventDefault(); setSubmitting(true); setError(''); try {
    await apiFetch('/suppliers', { method: 'POST', body: JSON.stringify({ ...form,
      kind: form.kind, tradeName: form.tradeName || undefined, email: form.email || undefined,
      phone: form.phone || undefined, contactName: form.contactName || undefined,
      addressLine1: form.addressLine1 || undefined, addressLine2: form.addressLine2 || undefined,
      district: form.district || undefined, city: form.city || undefined, state: form.state || undefined,
      postalCode: form.postalCode || undefined, notes: form.notes || undefined,
      consortiumMembers: form.kind === 'CONSORTIUM' ? form.memberIds.map((supplierId, index) => ({ supplierId, isLeader: index === 0 })) : undefined,
    }) }); setForm(EMPTY); setShowForm(false); setLoading(true); await load();
  } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Falha ao cadastrar fornecedor.'); } finally { setSubmitting(false); } }

  async function submitPenalty(event: FormEvent) { event.preventDefault(); if (!selected) return; setSubmitting(true); setError(''); try {
    await apiFetch(`/suppliers/${selected.id}/penalties`, { method: 'POST', body: JSON.stringify({ ...penalty,
      administrativeCase: penalty.administrativeCase || undefined, amount: penalty.amount ? Number(penalty.amount) : undefined }) });
    setPenalty(EMPTY_PENALTY); await load();
  } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Falha ao registrar sanção.'); } finally { setSubmitting(false); } }

  const companies = items.filter((item) => item.kind === 'COMPANY');
  return <div className="page-container"><header className="page-header"><div className="page-title"><h1>Fornecedores</h1><p>Empresas, consórcios, áreas cadastradas e histórico de sanções.</p></div><button className="btn btn-primary" type="button" onClick={() => setShowForm((value) => !value)}>{showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? 'Fechar cadastro' : 'Novo fornecedor'}</button></header>
  {error ? <div className="notice error" style={{ marginBottom: 18 }}>{error}</div> : null}
  {showForm ? <form className="card form-card" onSubmit={submit} style={{ marginBottom: 18 }}><section className="form-section"><div className="form-section-header"><h2>Dados cadastrais</h2><p>Selecione categorias da configuração operacional; um consórcio é composto por empresas já cadastradas.</p></div><div className="form-grid">
    <F c="col-3" l="Tipo *"><select className="select" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value, memberIds: [] })}><option value="COMPANY">Empresa</option><option value="CONSORTIUM">Consórcio</option></select></F>
    <F c="col-6" l="Razão social / denominação *"><input className="input" required value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} /></F>
    <F c="col-3" l="Nome fantasia"><input className="input" value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })} /></F>
    <F c="col-3" l="CNPJ/CPF *"><input className="input" required minLength={8} value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} /></F>
    <F c="col-3" l="Contato"><input className="input" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></F>
    <F c="col-3" l="E-mail"><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></F>
    <F c="col-3" l="Telefone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></F>
    <F c="col-3" l="CEP"><input className="input" value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} /></F>
    <F c="col-6" l="Endereço"><input className="input" value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} /></F>
    <F c="col-3" l="Complemento"><input className="input" value={form.addressLine2} onChange={(event) => setForm({ ...form, addressLine2: event.target.value })} /></F>
    <F c="col-4" l="Bairro"><input className="input" value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} /></F>
    <F c="col-6" l="Cidade"><input className="input" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></F>
    <F c="col-2" l="UF"><input className="input" maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })} /></F>
    <F c="col-12" l="Áreas de atuação"><details className="input" style={{ height: 'auto', minHeight: 42 }}><summary>{form.serviceAreaCategoryIds.length ? `${form.serviceAreaCategoryIds.length} categoria(s) selecionada(s)` : 'Selecione uma ou mais categorias'}</summary><div style={{ display: 'grid', gap: 8, padding: '12px 4px 4px' }}>{categories.map((category) => <label key={category.id} style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={form.serviceAreaCategoryIds.includes(category.id)} onChange={() => setForm({ ...form, serviceAreaCategoryIds: toggle(form.serviceAreaCategoryIds, category.id) })} /> {category.code} — {category.name}</label>)}</div></details></F>
    {form.kind === 'CONSORTIUM' ? <F c="col-12" l="Empresas integrantes (a primeira selecionada será a líder) *"><div className="card" style={{ padding: 14, display: 'grid', gap: 8 }}>{companies.map((company) => <label key={company.id} style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={form.memberIds.includes(company.id)} onChange={() => setForm({ ...form, memberIds: toggle(form.memberIds, company.id) })} /> {company.tradeName || company.legalName} — {company.taxId}</label>)}{!companies.length ? <span className="muted">Cadastre ao menos duas empresas antes do consórcio.</span> : null}</div></F> : null}
    <F c="col-12" l="Observações"><textarea className="textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></F>
  </div></section><div className="form-footer"><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn btn-primary" disabled={submitting}><Save size={16} /> {submitting ? 'Salvando…' : 'Salvar fornecedor'}</button></div></form> : null}
  {loading ? <LoadingPanel /> : <section className="card table-card">{items.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Fornecedor</th><th>Tipo / áreas</th><th>Endereço</th><th>Contato</th><th>Contratos</th><th>OS</th><th>Sanções</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}><td><span className="table-primary">{item.tradeName || item.legalName}</span><span className="table-secondary">{item.taxId}</span></td><td><span className="table-primary">{item.kind === 'CONSORTIUM' ? 'Consórcio' : 'Empresa'}</span><span className="table-secondary">{item.serviceAreaLinks?.map((link) => link.category.name).join(', ') || 'Sem área'}</span></td><td><span className="table-primary">{item.city ? `${item.city}/${item.state ?? ''}` : '—'}</span><span className="table-secondary">{item.addressLine1 || item.postalCode || 'Não informado'}</span></td><td><span className="table-primary">{item.contactName || '—'}</span><span className="table-secondary">{item.email || item.phone || 'Sem contato'}</span></td><td>{item._count?.contracts ?? 0}</td><td>{item._count?.directWorkOrders ?? 0}</td><td>{item._count?.penalties ?? 0}</td></tr>)}</tbody></table></div> : <EmptyState icon={UsersRound} title="Nenhum fornecedor cadastrado" description="Cadastre empresas para vinculá-las a contratos e ordens de serviço." />}</section>}
  {selected ? <section className="card form-card" style={{ marginTop: 18 }}><section className="form-section"><div className="form-section-header"><h2>{selected.tradeName || selected.legalName}</h2><p>{selected.kind === 'CONSORTIUM' ? `Consórcio com ${selected.consortiumMembers?.length ?? 0} integrante(s).` : 'Histórico cadastral e de sanções.'}</p></div>{selected.consortiumMembers?.length ? <div className="notice" style={{ marginBottom: 16 }}><strong>Integrantes:</strong> {selected.consortiumMembers.map((entry) => `${entry.member.tradeName || entry.member.legalName}${entry.isLeader ? ' (líder)' : ''}`).join(', ')}</div> : null}<h3>Sanções recebidas</h3>{selected.penalties?.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Data</th><th>Tipo</th><th>Processo</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>{selected.penalties.map((item) => <tr key={item.id}><td>{new Date(item.appliedAt).toLocaleDateString('pt-BR')}</td><td>{item.type}</td><td>{item.administrativeCase || '—'}</td><td>{item.description}</td><td>{item.amount ? money(item.amount) : '—'}</td></tr>)}</tbody></table></div> : <p className="muted">Nenhuma sanção registrada.</p>}
  <form onSubmit={submitPenalty} className="form-grid" style={{ marginTop: 18 }}><F c="col-3" l="Tipo"><select className="select" value={penalty.type} onChange={(event) => setPenalty({ ...penalty, type: event.target.value })}><option value="WARNING">Advertência</option><option value="FINE">Multa</option><option value="TEMPORARY_SUSPENSION">Suspensão temporária</option><option value="DEBARMENT">Impedimento</option><option value="OTHER">Outra</option></select></F><F c="col-3" l="Data de aplicação *"><input className="input" required type="date" value={penalty.appliedAt} onChange={(event) => setPenalty({ ...penalty, appliedAt: event.target.value })} /></F><F c="col-3" l="Processo"><input className="input" value={penalty.administrativeCase} onChange={(event) => setPenalty({ ...penalty, administrativeCase: event.target.value })} /></F><F c="col-3" l="Valor da multa (R$)"><input className="input" type="number" min="0" step="0.01" value={penalty.amount} onChange={(event) => setPenalty({ ...penalty, amount: event.target.value })} /></F><F c="col-10" l="Descrição *"><input className="input" required value={penalty.description} onChange={(event) => setPenalty({ ...penalty, description: event.target.value })} /></F><div className="field col-2" style={{ justifyContent: 'end' }}><button className="btn btn-primary" disabled={submitting}><ShieldAlert size={16} /> Registrar</button></div></form></section></section> : null}
  </div>;
}

function F({ c, l, children }: { c: string; l: string; children: React.ReactNode }) { return <div className={`field ${c}`}><label>{l}</label>{children}</div>; }
function toggle(values: string[], id: string) { return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]; }
function money(value: string | number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value)); }

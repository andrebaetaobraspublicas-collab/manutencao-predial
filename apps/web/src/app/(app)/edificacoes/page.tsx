'use client';

import { Building2, MapPin, Pencil, Plus, Save, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BuildingLocationPicker } from '@/components/building-location-picker';
import { EmptyState } from '@/components/empty-state';
import { LoadingPanel } from '@/components/loading';
import { apiFetch, ApiError } from '@/lib/api';
import type { Building, BuildingLocationConfirmation, CurrentSession } from '@/lib/types';

const EMPTY_FORM = {
  code: '',
  name: '',
  type: '',
  addressLine1: '',
  addressLine2: '',
  district: '',
  city: '',
  state: '',
  postalCode: '',
  grossAreaM2: '',
  constructionYear: '',
  floors: '',
};

type BuildingForm = typeof EMPTY_FORM;

export default function BuildingsPage() {
  const [items, setItems] = useState<Building[]>([]);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<BuildingForm>(EMPTY_FORM);
  const [location, setLocation] = useState<BuildingLocationConfirmation | null>(null);
  const [locationDirty, setLocationDirty] = useState(false);
  const [initialPoint, setInitialPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationVersion, setLocationVersion] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    Promise.all([apiFetch<Building[]>('/buildings'), apiFetch<CurrentSession>('/auth/me')])
      .then(([buildingItems, sessionData]) => {
        setItems(buildingItems);
        setSession(sessionData);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canManage = Boolean(session && ['OWNER', 'ADMIN', 'MANAGER'].includes(session.role));

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLocation(null);
    setLocationDirty(false);
    setInitialPoint(null);
    setLocationVersion((value) => value + 1);
  }

  function openCreate() {
    setError('');
    setSuccess('');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLocation(null);
    setLocationDirty(false);
    setInitialPoint(null);
    setLocationVersion((value) => value + 1);
    setShowForm(true);
  }

  function openEdit(building: Building) {
    const hasCoordinates = building.latitude !== null && building.latitude !== undefined && building.longitude !== null && building.longitude !== undefined;
    const point = hasCoordinates
      ? { latitude: Number(building.latitude), longitude: Number(building.longitude) }
      : null;
    setError('');
    setSuccess('');
    setEditingId(building.id);
    setForm({
      code: building.code,
      name: building.name,
      type: building.type ?? '',
      addressLine1: building.addressLine1,
      addressLine2: building.addressLine2 ?? '',
      district: building.district ?? '',
      city: building.city,
      state: building.state,
      postalCode: building.postalCode,
      grossAreaM2: building.grossAreaM2 == null ? '' : String(building.grossAreaM2),
      constructionYear: building.constructionYear == null ? '' : String(building.constructionYear),
      floors: building.floors == null ? '' : String(building.floors),
    });
    setInitialPoint(point);
    setLocation(
      point && building.geocodingConfirmed
        ? {
            ...point,
            source: building.geocodingSource ?? (building.geocodingProvider === 'MANUAL' ? 'MANUAL' : building.geocodingAccuracy === 'MANUAL' ? 'ADJUSTED' : 'PROVIDER'),
            lookupId: building.geocodingLookupId,
            candidateId: building.geocodingCandidateId,
            provider: building.geocodingProvider,
            accuracy: building.geocodingAccuracy,
            placeId: building.geocodingPlaceId,
            adjusted: building.geocodingAccuracy === 'MANUAL',
            confirmedAt: building.geocodingConfirmedAt ?? building.geocodedAt ?? new Date().toISOString(),
          }
        : null,
    );
    setLocationDirty(false);
    setLocationVersion((value) => value + 1);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateField<K extends keyof BuildingForm>(key: K, value: BuildingForm[K], affectsAddress = false) {
    setForm((current) => ({ ...current, [key]: value }));
    if (affectsAddress) {
      setLocation(null);
      setLocationDirty(true);
      setInitialPoint(null);
      setLocationVersion((current) => current + 1);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!location) {
      setError('Confirme a localização no mapa antes de salvar a edificação.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const includeLocation = !editingId || locationDirty;
      const payload = {
        code: form.code,
        name: form.name,
        type: form.type || (editingId ? '' : undefined),
        ...(includeLocation ? {
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2 || (editingId ? '' : undefined),
          district: form.district || (editingId ? '' : undefined),
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          country: 'BR',
          latitude: location.latitude,
          longitude: location.longitude,
          geocodingProvider: location.provider ?? (location.source === 'MANUAL' ? 'MANUAL' : undefined),
          geocodingAccuracy: location.accuracy ?? (location.adjusted ? 'MANUAL' : undefined),
          geocodingPlaceId: location.placeId ?? undefined,
          geocodingLookupId: location.lookupId ?? undefined,
          geocodingCandidateId: location.candidateId ?? undefined,
          geocodingSource: location.source,
          geocodingConfirmed: true,
        } : {}),
        grossAreaM2: form.grossAreaM2 ? Number(form.grossAreaM2) : editingId ? null : undefined,
        constructionYear: form.constructionYear ? Number(form.constructionYear) : editingId ? null : undefined,
        floors: form.floors ? Number(form.floors) : editingId ? null : undefined,
      };
      await apiFetch(editingId ? `/buildings/${editingId}` : '/buildings', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      const message = editingId ? 'Edificação e localização atualizadas.' : 'Edificação cadastrada com localização confirmada.';
      closeForm();
      setSuccess(message);
      setLoading(true);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar a edificação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-title">
          <h1>Edificações</h1>
          <p>Cadastro patrimonial com endereço validado, ponto confirmado no mapa e rastreabilidade da geocodificação.</p>
        </div>
        {canManage ? <button className="btn btn-primary" type="button" onClick={showForm ? closeForm : openCreate}>
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Fechar cadastro' : 'Nova edificação'}
        </button> : null}
      </header>
      {error ? <div className="notice error page-notice">{error}</div> : null}
      {success ? <div className="notice success page-notice">{success}</div> : null}

      {showForm ? (
        <form className="card form-card building-form" onSubmit={submit}>
          <section className="form-section">
            <div className="form-section-header">
              <h2>{editingId ? 'Editar edificação' : 'Identificação e endereço'}</h2>
              <p>Uma alteração no endereço invalida o ponto anterior e exige nova confirmação.</p>
            </div>
            <div className="form-grid">
              <Field col="col-3" label="Código *"><input className="input" required maxLength={40} value={form.code} onChange={(event) => updateField('code', event.target.value)} /></Field>
              <Field col="col-6" label="Nome *"><input className="input" required minLength={2} value={form.name} onChange={(event) => updateField('name', event.target.value)} /></Field>
              <Field col="col-3" label="Tipo"><input className="input" placeholder="Administrativo, hospital…" value={form.type} onChange={(event) => updateField('type', event.target.value)} /></Field>
              <Field col="col-8" label="Endereço *"><input className="input" required value={form.addressLine1} onChange={(event) => updateField('addressLine1', event.target.value, true)} /></Field>
              <Field col="col-4" label="Complemento"><input className="input" value={form.addressLine2} onChange={(event) => updateField('addressLine2', event.target.value, true)} /></Field>
              <Field col="col-3" label="Bairro"><input className="input" value={form.district} onChange={(event) => updateField('district', event.target.value, true)} /></Field>
              <Field col="col-4" label="Município *"><input className="input" required value={form.city} onChange={(event) => updateField('city', event.target.value, true)} /></Field>
              <Field col="col-2" label="UF *"><input className="input" required minLength={2} maxLength={2} value={form.state} onChange={(event) => updateField('state', event.target.value.toUpperCase(), true)} /></Field>
              <Field col="col-3" label="CEP *"><input className="input" required value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value, true)} /></Field>
            </div>
          </section>

          <section className="form-section">
            <BuildingLocationPicker
              key={locationVersion}
              address={{
                addressLine1: form.addressLine1,
                addressLine2: form.addressLine2,
                district: form.district,
                city: form.city,
                state: form.state,
                postalCode: form.postalCode,
              }}
              initialPoint={initialPoint}
              value={location}
              onChange={(next) => {
                setLocation(next);
                setLocationDirty(true);
              }}
              disabled={submitting}
            />
          </section>

          <section className="form-section">
            <div className="form-section-header"><h2>Características físicas</h2><p>Dados opcionais para indicadores patrimoniais e planejamento.</p></div>
            <div className="form-grid">
              <Field col="col-4" label="Área bruta (m²)"><input className="input" type="number" min="0" step="0.01" value={form.grossAreaM2} onChange={(event) => updateField('grossAreaM2', event.target.value)} /></Field>
              <Field col="col-4" label="Ano de construção"><input className="input" type="number" min="1800" max="2200" value={form.constructionYear} onChange={(event) => updateField('constructionYear', event.target.value)} /></Field>
              <Field col="col-4" label="Pavimentos"><input className="input" type="number" min="1" value={form.floors} onChange={(event) => updateField('floors', event.target.value)} /></Field>
            </div>
          </section>
          <div className="form-footer">
            <button className="btn btn-secondary" type="button" onClick={closeForm}>Cancelar</button>
            <button className="btn btn-primary" type="submit" disabled={submitting || !location}>
              <Save size={16} /> {submitting ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar edificação'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <LoadingPanel /> : (
        <section className="card table-card">
          {items.length ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Edificação</th><th>Endereço</th><th>Tipo</th><th>Área</th><th>Georreferência</th><th>OS</th>{canManage ? <th>Ações</th> : null}</tr></thead>
                <tbody>{items.map((item) => {
                  const hasCoordinates = item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined;
                  return (
                    <tr key={item.id}>
                      <td><span className="table-primary">{item.code} — {item.name}</span><span className="table-secondary">Status: {item.status.toLowerCase()}</span></td>
                      <td><span className="table-primary">{item.addressLine1}</span><span className="table-secondary">{item.city}/{item.state} · {item.postalCode}</span></td>
                      <td>{item.type || '—'}</td>
                      <td>{item.grossAreaM2 ? `${Number(item.grossAreaM2).toLocaleString('pt-BR')} m²` : '—'}</td>
                      <td>{hasCoordinates && item.geocodingConfirmed ? <><span className="badge success"><MapPin size={13} /> confirmada</span><span className="table-secondary">{item.geocodingProvider ?? 'manual'} · {item.geocodingAccuracy?.toLowerCase() ?? 'precisão não informada'}</span></> : hasCoordinates ? <span className="badge warning">requer confirmação</span> : <span className="badge warning">sem coordenadas</span>}</td>
                      <td><span className="badge neutral">{item._count?.workOrders ?? 0}</span></td>
                      {canManage ? <td><button className="btn btn-ghost" type="button" onClick={() => openEdit(item)}><Pencil size={15} /> Editar</button></td> : null}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={Building2} title="Nenhuma edificação cadastrada" description="Cadastre o primeiro imóvel e confirme o ponto no mapa para começar a operação." />}
        </section>
      )}
    </div>
  );
}

function Field({ col, label, children }: { col: string; label: string; children: React.ReactNode }) {
  return <div className={`field ${col}`}><label>{label}</label>{children}</div>;
}

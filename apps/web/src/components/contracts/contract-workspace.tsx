'use client';

import { ExternalLink, FileDown, Pencil, Save, Trash2, Upload, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { apiFetch, apiFileUrl } from '@/lib/api';
import { BRL, formatDate } from '@/lib/format';
import type { Contract, InspectorProfile, Supplier } from '@/lib/types';

type Row = Record<string, unknown>;
type Column = { key: string; label: string; value?: (row: Row) => React.ReactNode };

const OLD_EMPTY = {
  number: '', type: 'TERM_EXTENSION', description: '', signedAt: '', endDateAfter: '',
  valueChange: '', referencePeriod: '', approvalDate: '', percentage: '', amount: '',
  indexName: '', supplierId: '', subcontractorName: '', subcontractorTaxId: '', scope: '',
  approvedAt: '', authorizationCase: '', appliedAt: '', administrativeCase: '',
};

const TABS = [
  ['summary', 'Resumo'],
  ['amendments', 'Prazo e aditivos'],
  ['subcontracts', 'Subcontratações'],
  ['penalties', 'Sanções'],
  ['work-orders', 'Ordens de serviço'],
  ['adjustments', 'Reajustes e repactuações'],
  ['commitments', 'Empenhos'],
  ['inspection-team', 'Equipe de fiscalização'],
  ['guarantees', 'Garantias'],
  ['apostilles', 'Apostilamentos'],
  ['receipts', 'Recebimentos'],
  ['construction-diaries', 'Diário de obras'],
  ['communications', 'Comunicações e pleitos'],
] as const;

export function ContractWorkspace({
  contract,
  suppliers,
  inspectors,
  onRefresh,
  onError,
}: {
  contract: Contract;
  suppliers: Supplier[];
  inspectors: InspectorProfile[];
  onRefresh(): Promise<void>;
  onError(value: string): void;
}) {
  const [tab, setTab] = useState('summary');
  const [oldForm, setOldForm] = useState(OLD_EMPTY);
  const [form, setForm] = useState<Record<string, string>>(defaultsFor('summary'));
  const [isPrimary, setIsPrimary] = useState(false);
  const [provisionalRequired, setProvisionalRequired] = useState(true);
  const [extensionApproved, setExtensionApproved] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);

  function switchTab(value: string) {
    setTab(value);
    setOldForm(OLD_EMPTY);
    setForm(defaultsFor(value));
    setIsPrimary(false);
    setProvisionalRequired(true);
    setExtensionApproved(false);
    setFile(null);
    setEditingRow(null);
  }

  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitOldEvent(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    onError('');
    try {
      let endpoint = '';
      let payload: Record<string, unknown> = {};
      if (tab === 'amendments') {
        endpoint = 'amendments';
        payload = { number: oldForm.number, type: oldForm.type, description: oldForm.description,
          signedAt: oldForm.signedAt || undefined, endDateAfter: oldForm.endDateAfter || undefined,
          valueChange: oldForm.valueChange ? Number(oldForm.valueChange) : undefined };
      } else if (tab === 'adjustments') {
        endpoint = 'adjustments';
        payload = { type: oldForm.type, referencePeriod: oldForm.referencePeriod,
          approvalDate: oldForm.approvalDate, percentage: oldForm.percentage ? Number(oldForm.percentage) : undefined,
          amount: Number(oldForm.amount), indexName: oldForm.indexName || undefined };
      } else if (tab === 'subcontracts') {
        endpoint = 'subcontracts';
        const selected = suppliers.find((item) => item.id === oldForm.supplierId);
        payload = { supplierId: oldForm.supplierId || undefined,
          subcontractorName: selected?.legalName || oldForm.subcontractorName,
          subcontractorTaxId: selected?.taxId || oldForm.subcontractorTaxId || undefined,
          scope: oldForm.scope, approvedAt: oldForm.approvedAt,
          authorizationCase: oldForm.authorizationCase,
          amount: oldForm.amount ? Number(oldForm.amount) : undefined };
      } else if (tab === 'penalties') {
        endpoint = 'penalties';
        payload = { type: oldForm.type, administrativeCase: oldForm.administrativeCase || undefined,
          description: oldForm.description, appliedAt: oldForm.appliedAt,
          amount: oldForm.amount ? Number(oldForm.amount) : undefined };
      }
      await apiFetch(editingRow
        ? `/contracts/${contract.id}/governance/${endpoint}/${String(editingRow.id)}`
        : `/contracts/${contract.id}/${endpoint}`, {
        method: editingRow ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
      setOldForm(OLD_EMPTY);
      setEditingRow(null);
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Falha ao registrar evento contratual.');
    } finally {
      setSaving(false);
    }
  }

  async function submitGovernance(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    onError('');
    try {
      const payload = governancePayload(tab, form, {
        isPrimary,
        provisionalRequired,
        extensionApproved,
      });
      const created = await apiFetch<{ id: string }>(editingRow
        ? `/contracts/${contract.id}/governance/${tab}/${String(editingRow.id)}`
        : `/contracts/${contract.id}/${tab}`, {
        method: editingRow ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      if (file && tab !== 'inspection-team' && !editingRow) {
        const attachment = new FormData();
        attachment.append('file', file);
        attachment.append('entityType', attachmentEntity(tab));
        attachment.append('entityId', created.id);
        attachment.append('kind', attachmentKind(tab));
        await apiFetch(`/contracts/${contract.id}/dossier-attachments`, {
          method: 'POST',
          body: attachment,
        });
      }
      setForm(defaultsFor(tab));
      setFile(null);
      setIsPrimary(false);
      setProvisionalRequired(true);
      setExtensionApproved(false);
      setEditingRow(null);
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Falha ao registrar informação contratual.');
    } finally {
      setSaving(false);
    }
  }

  async function archive(kind: string, row: Row) {
    const id = String(row.id ?? '');
    if (!id || !window.confirm('Excluir este registro? O histórico ficará preservado na auditoria.')) return;
    try {
      await apiFetch(`/contracts/${contract.id}/governance/${kind}/${id}`, { method: 'DELETE' });
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Não foi possível excluir o registro.');
    }
  }

  function cancelEditing() {
    setEditingRow(null);
    setOldForm(OLD_EMPTY);
    setForm(defaultsFor(tab));
    setIsPrimary(false);
    setProvisionalRequired(true);
    setExtensionApproved(false);
    setFile(null);
  }

  function edit(row: Row) {
    setEditingRow(row);
    if (['amendments', 'adjustments', 'subcontracts', 'penalties'].includes(tab)) {
      setOldForm(oldFormFromRow(row));
    } else {
      setForm(governanceFormFromRow(tab, row));
      setIsPrimary(Boolean(row.isPrimary));
      setProvisionalRequired(row.provisionalRequired !== false);
      setExtensionApproved(Boolean(row.extensionApproved));
    }
    setFile(null);
    window.setTimeout(() => document.querySelector('.contract-record-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  const documents = contract.dossierAttachments ?? [];
  const workOrders = (contract.workOrders ?? []).map((entry) => entry.workOrder);

  return <section className="card form-card contract-workspace" style={{ marginTop: 18 }}>
    <section className="form-section">
      <div className="form-section-header">
        <h2>Dossiê {contract.code}</h2>
        <p>Processo de origem: {contract.administrativeProcess || 'não informado'} · fornecedor: {contract.supplier.tradeName || contract.supplier.legalName}</p>
      </div>
      <div className="contract-tabs" role="tablist" aria-label="Seções do dossiê contratual">
        {TABS.map(([value, label]) => <button type="button" key={value} className={`btn ${tab === value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab(value)}>{label}</button>)}
      </div>

      {editingRow ? <div className="contract-edit-notice"><span>Editando o registro selecionado. Revise os campos e salve as alterações.</span><button type="button" className="btn btn-ghost" onClick={cancelEditing}><X size={15} /> Cancelar edição</button></div> : null}

      {tab === 'summary' ? <Summary contract={contract} /> : null}

      {tab === 'amendments' ? <>
        <EventTable rows={contract.amendments ?? []} columns={[
          { key: 'number', label: 'Número' }, { key: 'type', label: 'Tipo' },
          { key: 'description', label: 'Descrição' }, { key: 'endDateAfter', label: 'Nova vigência final' },
          { key: 'valueChange', label: 'Impacto financeiro' },
        ]} onEdit={edit} onDelete={(row) => void archive('amendments', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitOldEvent}>
          <Field c="col-2" label="Número *"><input className="input" required value={oldForm.number} onChange={(e) => setOldForm({ ...oldForm, number: e.target.value })} /></Field>
          <Field c="col-3" label="Tipo"><select className="select" value={oldForm.type} onChange={(e) => setOldForm({ ...oldForm, type: e.target.value })}><option value="TERM_EXTENSION">Prorrogação de prazo</option><option value="VALUE_INCREASE">Acréscimo</option><option value="VALUE_DECREASE">Supressão</option><option value="SCOPE_CHANGE">Alteração de escopo</option><option value="OTHER">Outro</option></select></Field>
          <Field c="col-3" label="Assinatura"><input className="input" type="date" value={oldForm.signedAt} onChange={(e) => setOldForm({ ...oldForm, signedAt: e.target.value })} /></Field>
          <Field c="col-2" label="Nova vigência final"><input className="input" type="date" value={oldForm.endDateAfter} onChange={(e) => setOldForm({ ...oldForm, endDateAfter: e.target.value })} /></Field>
          <Field c="col-2" label="Impacto (R$)"><input className="input" type="number" step="0.01" value={oldForm.valueChange} onChange={(e) => setOldForm({ ...oldForm, valueChange: e.target.value })} /></Field>
          <Field c="col-10" label="Descrição *"><input className="input" required value={oldForm.description} onChange={(e) => setOldForm({ ...oldForm, description: e.target.value })} /></Field>
          <Submit saving={saving} />
        </form>
      </> : null}

      {tab === 'adjustments' ? <>
        <EventTable rows={contract.adjustments ?? []} columns={[
          { key: 'type', label: 'Tipo' }, { key: 'referencePeriod', label: 'Período de referência' },
          { key: 'approvalDate', label: 'Data de aprovação' }, { key: 'percentage', label: 'Percentual' },
          { key: 'amount', label: 'Impacto financeiro' },
        ]} onEdit={edit} onDelete={(row) => void archive('adjustments', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitOldEvent}>
          <Field c="col-3" label="Tipo"><select className="select" value={oldForm.type} onChange={(e) => setOldForm({ ...oldForm, type: e.target.value })}><option value="PRICE_ADJUSTMENT">Reajuste</option><option value="REPACTUATION">Repactuação</option><option value="ECONOMIC_REBALANCING">Reequilíbrio econômico</option></select></Field>
          <Field c="col-2" label="Período de referência *"><input className="input" required value={oldForm.referencePeriod} onChange={(e) => setOldForm({ ...oldForm, referencePeriod: e.target.value })} /></Field>
          <Field c="col-2" label="Aprovação *"><input className="input" required type="date" value={oldForm.approvalDate} onChange={(e) => setOldForm({ ...oldForm, approvalDate: e.target.value })} /></Field>
          <Field c="col-2" label="Percentual"><input className="input" type="number" step="0.000001" value={oldForm.percentage} onChange={(e) => setOldForm({ ...oldForm, percentage: e.target.value })} /></Field>
          <Field c="col-3" label="Impacto (R$) *"><input className="input" required type="number" step="0.01" value={oldForm.amount} onChange={(e) => setOldForm({ ...oldForm, amount: e.target.value })} /></Field>
          <Field c="col-10" label="Índice"><input className="input" value={oldForm.indexName} onChange={(e) => setOldForm({ ...oldForm, indexName: e.target.value })} /></Field>
          <Submit saving={saving} />
        </form>
      </> : null}

      {tab === 'subcontracts' ? <>
        <EventTable rows={contract.subcontractors ?? []} columns={[
          { key: 'subcontractorName', label: 'Subcontratada' }, { key: 'subcontractorTaxId', label: 'CNPJ' },
          { key: 'scope', label: 'Escopo' }, { key: 'authorizationCase', label: 'Autorização/processo' },
          { key: 'amount', label: 'Valor' },
        ]} onEdit={edit} onDelete={(row) => void archive('subcontracts', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitOldEvent}>
          <Field c="col-4" label="Empresa cadastrada"><select className="select" value={oldForm.supplierId} onChange={(e) => setOldForm({ ...oldForm, supplierId: e.target.value })}><option value="">Outra empresa</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.tradeName || item.legalName}</option>)}</select></Field>
          <Field c="col-4" label="Nome da subcontratada *"><input className="input" required={!oldForm.supplierId} disabled={Boolean(oldForm.supplierId)} value={oldForm.subcontractorName} onChange={(e) => setOldForm({ ...oldForm, subcontractorName: e.target.value })} /></Field>
          <Field c="col-4" label="CNPJ"><input className="input" disabled={Boolean(oldForm.supplierId)} value={oldForm.subcontractorTaxId} onChange={(e) => setOldForm({ ...oldForm, subcontractorTaxId: e.target.value })} /></Field>
          <Field c="col-3" label="Autorização/processo *"><input className="input" required value={oldForm.authorizationCase} onChange={(e) => setOldForm({ ...oldForm, authorizationCase: e.target.value })} /></Field>
          <Field c="col-3" label="Data da autorização *"><input className="input" required type="date" value={oldForm.approvedAt} onChange={(e) => setOldForm({ ...oldForm, approvedAt: e.target.value })} /></Field>
          <Field c="col-2" label="Valor"><input className="input" type="number" step="0.01" value={oldForm.amount} onChange={(e) => setOldForm({ ...oldForm, amount: e.target.value })} /></Field>
          <Field c="col-4" label="Escopo *"><input className="input" required value={oldForm.scope} onChange={(e) => setOldForm({ ...oldForm, scope: e.target.value })} /></Field>
          <Submit saving={saving} />
        </form>
      </> : null}

      {tab === 'penalties' ? <>
        <EventTable rows={contract.penalties ?? []} columns={[
          { key: 'appliedAt', label: 'Data da aplicação' }, { key: 'type', label: 'Tipo' },
          { key: 'administrativeCase', label: 'Processo administrativo' },
          { key: 'description', label: 'Descrição' }, { key: 'amount', label: 'Valor' },
        ]} onEdit={edit} onDelete={(row) => void archive('penalties', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitOldEvent}>
          <Field c="col-3" label="Tipo"><select className="select" value={oldForm.type} onChange={(e) => setOldForm({ ...oldForm, type: e.target.value })}><option value="WARNING">Advertência</option><option value="FINE">Multa</option><option value="TEMPORARY_SUSPENSION">Suspensão</option><option value="DEBARMENT">Impedimento</option><option value="OTHER">Outra</option></select></Field>
          <Field c="col-3" label="Data *"><input className="input" required type="date" value={oldForm.appliedAt} onChange={(e) => setOldForm({ ...oldForm, appliedAt: e.target.value })} /></Field>
          <Field c="col-3" label="Processo"><input className="input" value={oldForm.administrativeCase} onChange={(e) => setOldForm({ ...oldForm, administrativeCase: e.target.value })} /></Field>
          <Field c="col-3" label="Valor"><input className="input" type="number" step="0.01" value={oldForm.amount} onChange={(e) => setOldForm({ ...oldForm, amount: e.target.value })} /></Field>
          <Field c="col-10" label="Descrição *"><input className="input" required value={oldForm.description} onChange={(e) => setOldForm({ ...oldForm, description: e.target.value })} /></Field>
          <Submit saving={saving} />
        </form>
      </> : null}

      {tab === 'work-orders' ? <EventTable rows={workOrders as unknown as Row[]} columns={[
        { key: 'number', label: 'Número' }, { key: 'title', label: 'Descrição' }, { key: 'status', label: 'Situação' },
      ]} onEdit={(row) => window.location.assign(`/ordens-servico/detalhe/?id=${String(row.id)}`)} /> : null}

      {tab === 'commitments' ? <><EventTable rows={contract.commitments ?? []} columns={[
        { key: 'number', label: 'Número do empenho' }, { key: 'fiscalYear', label: 'Exercício' },
        { key: 'issueDate', label: 'Data de emissão' }, { key: 'originalValue', label: 'Valor original' },
      ]} onEdit={() => window.location.assign('/empenhos/')} /><a className="btn btn-secondary" href="/empenhos/"><ExternalLink size={15} /> Abrir gestão de empenhos</a></> : null}

      {tab === 'inspection-team' ? <>
        <EventTable rows={contract.inspectionTeam ?? []} columns={[
          { key: 'inspector', label: 'Gestor/fiscal', value: (row) => String((row.inspector as Row | undefined)?.name ?? '—') },
          { key: 'role', label: 'Função' }, { key: 'designationAct', label: 'Portaria/ato de designação' },
          { key: 'startsAt', label: 'Início' }, { key: 'endsAt', label: 'Fim' },
          { key: 'isPrimary', label: 'Titular' },
        ]} onEdit={edit} onDelete={(row) => void archive('inspection-team', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitGovernance}>
          <Field c="col-4" label="Gestor ou fiscal *"><InspectorSelect required inspectors={inspectors} value={form.inspectorProfileId} onChange={(value) => set('inspectorProfileId', value)} /></Field>
          <Field c="col-3" label="Função na equipe *"><select className="select" value={form.role} onChange={(e) => set('role', e.target.value)}><option value="CONTRACT_MANAGER">Gestor do contrato</option><option value="SUBSTITUTE_MANAGER">Gestor substituto</option><option value="TECHNICAL_INSPECTOR">Fiscal técnico</option><option value="ADMINISTRATIVE_INSPECTOR">Fiscal administrativo</option><option value="SECTORAL_INSPECTOR">Fiscal setorial</option><option value="SUBSTITUTE_INSPECTOR">Fiscal substituto</option></select></Field>
          <Field c="col-5" label="Portaria/ato de designação *"><input className="input" required value={form.designationAct} onChange={(e) => set('designationAct', e.target.value)} /></Field>
          <Field c="col-3" label="Início da designação *"><input className="input" required type="date" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
          <Field c="col-3" label="Fim da designação"><input className="input" type="date" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
          <Field c="col-2" label="Titular"><label className="checkbox-row"><input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} /> Designação principal</label></Field>
          <Field c="col-4" label="Observações"><input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <Submit saving={saving} />
        </form>
      </> : null}

      {tab === 'guarantees' ? <>
        <EventTable rows={contract.guarantees ?? []} columns={[
          { key: 'number', label: 'Número da garantia' }, { key: 'modality', label: 'Modalidade' },
          { key: 'guaranteedValue', label: 'Valor garantido' }, { key: 'minimumPercentage', label: 'Percentual mínimo' },
          { key: 'endsAt', label: 'Fim da vigência' }, { key: 'status', label: 'Situação' },
          { key: 'workflow', label: 'Etapa atual' },
        ]} onEdit={edit} onDelete={(row) => void archive('guarantees', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitGovernance}>
          <Field c="col-3" label="Nº da garantia *"><input className="input" required value={form.number} onChange={(e) => set('number', e.target.value)} /></Field>
          <Field c="col-3" label="Modalidade *"><select className="select" value={form.modality} onChange={(e) => set('modality', e.target.value)}><option value="CASH_DEPOSIT">Caução em dinheiro</option><option value="PUBLIC_DEBT_BONDS">Caução em títulos da dívida pública</option><option value="SURETY_BOND">Seguro-garantia</option><option value="BANK_GUARANTEE">Fiança bancária</option><option value="OTHER">Outra modalidade admitida</option></select></Field>
          <Field c="col-3" label="Seguradora/instituição"><input className="input" value={form.guarantorName} onChange={(e) => set('guarantorName', e.target.value)} /></Field>
          <Field c="col-3" label="CNPJ da garantidora"><input className="input" value={form.guarantorTaxId} onChange={(e) => set('guarantorTaxId', e.target.value)} /></Field>
          <Field c="col-2" label="Percentual do contrato (%) *"><input className="input" required type="number" min="0" step="0.000001" value={form.contractPercentage} onChange={(e) => set('contractPercentage', e.target.value)} /></Field>
          <Field c="col-2" label="Valor garantido"><input className="input" type="number" min="0" step="0.01" placeholder="Cálculo automático" value={form.guaranteedValue} onChange={(e) => set('guaranteedValue', e.target.value)} /></Field>
          <Field c="col-2" label="Percentual mínimo (%) *"><input className="input" required type="number" min="0" step="0.000001" value={form.minimumPercentage} onChange={(e) => set('minimumPercentage', e.target.value)} /></Field>
          <Field c="col-2" label="Data de emissão"><input className="input" type="date" value={form.issuedAt} onChange={(e) => set('issuedAt', e.target.value)} /></Field>
          <Field c="col-2" label="Início da vigência *"><input className="input" required type="date" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
          <Field c="col-2" label="Fim da vigência *"><input className="input" required type="date" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
          <Field c="col-3" label="Situação *"><select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>{guaranteeStatusOptions()}</select></Field>
          <Field c="col-3" label="Responsável pela análise"><InspectorSelect inspectors={inspectors} value={form.analystInspectorId} onChange={(value) => set('analystInspectorId', value)} /></Field>
          <Field c="col-3" label="Workflow atual *"><select className="select" value={form.workflow} onChange={(e) => set('workflow', e.target.value)}><option>Análise inicial</option><option>Aguardando documentação</option><option>Aguardando jurídico</option><option>Aguardando controle interno</option><option>Aguardando autoridade competente</option><option>Aguardando renovação</option><option>Aguardando complementação</option><option>Execução da garantia</option><option>Liberação da garantia</option><option>Concluído</option></select></Field>
          <Field c="col-3" label="Valor a executar"><input className="input" type="number" min="0" step="0.01" value={form.executionValue} onChange={(e) => set('executionValue', e.target.value)} /></Field>
          <Field c="col-3" label="Valor recuperado"><input className="input" type="number" min="0" step="0.01" value={form.recoveredValue} onChange={(e) => set('recoveredValue', e.target.value)} /></Field>
          <Field c="col-3" label="Data de liberação"><input className="input" type="date" value={form.releasedAt} onChange={(e) => set('releasedAt', e.target.value)} /></Field>
          <Field c="col-6" label="Coberturas contratadas"><textarea className="textarea" value={form.coverages} onChange={(e) => set('coverages', e.target.value)} /></Field>
          <Field c="col-6" label="Histórico/observações"><textarea className="textarea" value={form.history} onChange={(e) => set('history', e.target.value)} /></Field>
          <FileField file={file} setFile={setFile} label="Apólice, carta-fiança ou comprovante" />
          <Submit saving={saving} />
        </form>
        <Documents contractId={contract.id} documents={documents.filter((item) => item.entityType === 'GUARANTEE')} />
      </> : null}

      {tab === 'apostilles' ? <>
        <EventTable rows={contract.apostilles ?? []} columns={[
          { key: 'number', label: 'Número' }, { key: 'type', label: 'Tipo' }, { key: 'date', label: 'Data' },
          { key: 'indexName', label: 'Índice' }, { key: 'percentage', label: 'Percentual' },
          { key: 'valueBefore', label: 'Valor anterior' }, { key: 'valueChange', label: 'Impacto' },
          { key: 'valueAfter', label: 'Valor atualizado' },
        ]} onEdit={edit} onDelete={(row) => void archive('apostilles', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitGovernance}>
          <Field c="col-2" label="Número *"><input className="input" required value={form.number} onChange={(e) => set('number', e.target.value)} /></Field>
          <Field c="col-3" label="Tipo *"><select className="select" value={form.type} onChange={(e) => set('type', e.target.value)}><option value="PRICE_ADJUSTMENT">Reajustamento</option><option value="REPACTUATION">Repactuação</option><option value="MONETARY_UPDATE">Atualização monetária</option><option value="BUDGET_ALLOCATION_CHANGE">Alteração de dotação</option><option value="FUNDING_SOURCE_CHANGE">Alteração de fonte de recursos</option><option value="REGISTRATION_CORRECTION">Correção cadastral</option><option value="OTHER_LEGAL_BASIS">Outra hipótese legal</option></select></Field>
          <Field c="col-2" label="Data *"><input className="input" required type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field c="col-2" label="Índice"><input className="input" value={form.indexName} onChange={(e) => set('indexName', e.target.value)} /></Field>
          <Field c="col-2" label="Percentual aplicado (%)"><input className="input" type="number" step="0.000001" value={form.percentage} onChange={(e) => set('percentage', e.target.value)} /></Field>
          <Field c="col-3" label="Impacto financeiro (R$)"><input className="input" type="number" step="0.01" placeholder="Calculado pelo percentual" value={form.valueChange} onChange={(e) => set('valueChange', e.target.value)} /></Field>
          <Field c="col-9" label="Memória de cálculo"><textarea className="textarea" value={form.calculationMemo} onChange={(e) => set('calculationMemo', e.target.value)} /></Field>
          <Field c="col-12" label="Justificativa *"><textarea className="textarea" required value={form.justification} onChange={(e) => set('justification', e.target.value)} /></Field>
          <FileField file={file} setFile={setFile} label="Documento do apostilamento (PDF)" />
          <Submit saving={saving} />
        </form>
        <Documents contractId={contract.id} documents={documents.filter((item) => item.entityType === 'APOSTILLE')} />
      </> : null}

      {tab === 'receipts' ? <>
        <EventTable rows={contract.receipts ?? []} columns={[
          { key: 'number', label: 'Processo/termo' }, { key: 'type', label: 'Tipo de recebimento' },
          { key: 'inspectionDate', label: 'Data da vistoria' },
          { key: 'responsibleInspector', label: 'Responsável', value: (row) => String((row.responsibleInspector as Row | undefined)?.name ?? '—') },
          { key: 'decision', label: 'Decisão técnica' }, { key: 'status', label: 'Situação' },
        ]} onEdit={edit} onDelete={(row) => void archive('receipts', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitGovernance}>
          <Field c="col-3" label="Nº do processo/termo *"><input className="input" required value={form.number} onChange={(e) => set('number', e.target.value)} /></Field>
          <Field c="col-3" label="Tipo de recebimento *"><select className="select" value={form.type} onChange={(e) => set('type', e.target.value)}><option value="PROVISIONAL">Recebimento provisório</option><option value="DEFINITIVE">Recebimento definitivo</option><option value="PARTIAL">Recebimento parcial</option><option value="BY_STAGE">Recebimento por etapa</option><option value="REJECTION">Rejeição do objeto</option></select></Field>
          <Field c="col-3" label="Categoria do objeto *"><select className="select" value={form.objectCategory} onChange={(e) => set('objectCategory', e.target.value)}><option>Obras e serviços de engenharia</option><option>Serviços continuados</option><option>Serviços não continuados</option><option>Fornecimento de bens</option><option>Soluções de tecnologia da informação</option><option>Locações</option><option>Contratos especiais</option></select></Field>
          <Field c="col-3" label="Protocolo da solicitação"><input className="input" value={form.requestProtocol} onChange={(e) => set('requestProtocol', e.target.value)} /></Field>
          <Field c="col-3" label="Data/hora do protocolo"><input className="input" type="datetime-local" value={form.protocolAt} onChange={(e) => set('protocolAt', e.target.value)} /></Field>
          <Field c="col-3" label="Data da vistoria"><input className="input" type="date" value={form.inspectionDate} onChange={(e) => set('inspectionDate', e.target.value)} /></Field>
          <Field c="col-3" label="Responsável/fiscal"><InspectorSelect inspectors={inspectors} value={form.responsibleInspectorId} onChange={(value) => set('responsibleInspectorId', value)} /></Field>
          <Field c="col-3" label="Status do workflow *"><select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>{receiptStatusOptions()}</select></Field>
          <Field c="col-3" label="Decisão técnica *"><select className="select" value={form.decision} onChange={(e) => set('decision', e.target.value)}><option value="APPROVE">Aprovar</option><option value="APPROVE_WITH_PENDING_ITEMS">Aprovar com pendências</option><option value="REJECT">Rejeitar</option><option value="SUSPEND_FOR_DILIGENCE">Suspender para diligência</option></select></Field>
          <Field c="col-3" label="Recebimento provisório exigido?"><select className="select" value={provisionalRequired ? 'yes' : 'no'} onChange={(e) => setProvisionalRequired(e.target.value === 'yes')}><option value="yes">Sim</option><option value="no">Não, hipótese excepcional justificada</option></select></Field>
          <Field c="col-4" label="Comissão/portaria"><input className="input" value={form.commissionOrdinance} onChange={(e) => set('commissionOrdinance', e.target.value)} /></Field>
          <Field c="col-2" label="Quórum"><select className="select" value={form.quorum} onChange={(e) => set('quorum', e.target.value)}><option>Não se aplica</option><option>Quórum atendido</option><option>Quórum não atendido</option></select></Field>
          <Field c="col-6" label="Documentos apresentados pela contratada"><textarea className="textarea" value={form.contractorDocuments} onChange={(e) => set('contractorDocuments', e.target.value)} /></Field>
          <Field c="col-6" label="Inspeções, vistorias e testes"><textarea className="textarea" value={form.inspectionsAndTests} onChange={(e) => set('inspectionsAndTests', e.target.value)} /></Field>
          <Field c="col-3" label="Início da observação"><input className="input" type="date" value={form.observationStartsAt} onChange={(e) => set('observationStartsAt', e.target.value)} /></Field>
          <Field c="col-3" label="Fim previsto da observação"><input className="input" type="date" value={form.observationEndsAt} onChange={(e) => set('observationEndsAt', e.target.value)} /></Field>
          <Field c="col-3" label="Garantia técnica até"><input className="input" type="date" value={form.technicalWarrantyEndsAt} onChange={(e) => set('technicalWarrantyEndsAt', e.target.value)} /></Field>
          <Field c="col-3" label="Autoridade competente"><input className="input" value={form.competentAuthority} onChange={(e) => set('competentAuthority', e.target.value)} /></Field>
          <Field c="col-12" label="Ocorrências, defeitos e chamados de garantia"><textarea className="textarea" value={form.occurrences} onChange={(e) => set('occurrences', e.target.value)} /></Field>
          <Field c="col-12" label="Parecer consolidado *"><textarea className="textarea" required value={form.consolidatedOpinion} onChange={(e) => set('consolidatedOpinion', e.target.value)} /></Field>
          <Field c="col-5" label="Nova pendência"><input className="input" value={form.pendingDescription} onChange={(e) => set('pendingDescription', e.target.value)} /></Field>
          <Field c="col-2" label="Criticidade"><select className="select" value={form.pendingCriticality} onChange={(e) => set('pendingCriticality', e.target.value)}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select></Field>
          <Field c="col-2" label="Prazo para correção"><input className="input" type="date" value={form.pendingDueAt} onChange={(e) => set('pendingDueAt', e.target.value)} /></Field>
          <Field c="col-3" label="Responsável pela correção"><input className="input" value={form.pendingResponsible} onChange={(e) => set('pendingResponsible', e.target.value)} /></Field>
          <FileField file={file} setFile={setFile} label="Termo, documentos ou evidências" />
          <Submit saving={saving} />
        </form>
        <Documents contractId={contract.id} documents={documents.filter((item) => item.entityType === 'RECEIPT')} />
      </> : null}

      {tab === 'construction-diaries' ? <>
        <EventTable rows={contract.constructionDiaries ?? []} columns={[
          { key: 'number', label: 'Nº do registro' }, { key: 'date', label: 'Data' },
          { key: 'workOrder', label: 'Ordem de serviço', value: (row) => String((row.workOrder as Row | undefined)?.number ?? '—') },
          { key: 'responsibleInspector', label: 'Responsável', value: (row) => String((row.responsibleInspector as Row | undefined)?.name ?? '—') },
          { key: 'operationalSituation', label: 'Situação operacional' }, { key: 'status', label: 'Situação do registro' },
        ]} onEdit={edit} onDelete={(row) => void archive('construction-diaries', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitGovernance}>
          <Field c="col-3" label="Nº do registro *"><input className="input" required value={form.number} onChange={(e) => set('number', e.target.value)} /></Field>
          <Field c="col-3" label="Ordem de serviço"><select className="select" value={form.workOrderId} onChange={(e) => set('workOrderId', e.target.value)}><option value="">Sem OS específica</option>{workOrders.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}</select></Field>
          <Field c="col-3" label="Data *"><input className="input" required type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field c="col-3" label="Responsável pelo registro"><InspectorSelect inspectors={inspectors} value={form.responsibleInspectorId} onChange={(value) => set('responsibleInspectorId', value)} /></Field>
          <Field c="col-2" label="Hora de abertura"><input className="input" type="time" value={form.openTime} onChange={(e) => set('openTime', e.target.value)} /></Field>
          <Field c="col-2" label="Hora de encerramento"><input className="input" type="time" value={form.closeTime} onChange={(e) => set('closeTime', e.target.value)} /></Field>
          <Field c="col-4" label="Situação operacional *"><input className="input" required value={form.operationalSituation} onChange={(e) => set('operationalSituation', e.target.value)} /></Field>
          <Field c="col-2" label="Condições climáticas"><select className="select" value={form.weather} onChange={(e) => set('weather', e.target.value)}><option>Ensolarado</option><option>Nublado</option><option>Chuva fraca</option><option>Chuva intensa</option><option>Não se aplica</option></select></Field>
          <Field c="col-2" label="Temperatura (°C)"><input className="input" type="number" step="0.1" value={form.temperatureCelsius} onChange={(e) => set('temperatureCelsius', e.target.value)} /></Field>
          <Field c="col-2" label="Precipitação (mm)"><input className="input" type="number" min="0" step="0.1" value={form.precipitationMm} onChange={(e) => set('precipitationMm', e.target.value)} /></Field>
          <Field c="col-2" label="Status"><select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}><option value="OPEN">Aberto</option><option value="CLOSED">Encerrado</option><option value="VALIDATED">Validado pela fiscalização</option><option value="CONTESTED">Impugnado/contestado</option></select></Field>
          <Field c="col-3" label="Frente de trabalho"><input className="input" value={form.workFront} onChange={(e) => set('workFront', e.target.value)} /></Field>
          <Field c="col-2" label="Efetivo próprio"><input className="input" type="number" min="0" value={form.ownWorkforce} onChange={(e) => set('ownWorkforce', e.target.value)} /></Field>
          <Field c="col-2" label="Efetivo terceirizado"><input className="input" type="number" min="0" value={form.outsourcedWorkforce} onChange={(e) => set('outsourcedWorkforce', e.target.value)} /></Field>
          <Field c="col-5" label="Impacto contratual"><select className="select" value={form.contractualImpact} onChange={(e) => set('contractualImpact', e.target.value)}><option>Sem impacto identificado</option><option>Impacta medição</option><option>Possível aditivo</option><option>Possível apostilamento/reequilíbrio</option><option>Possível sanção/notificação</option><option>Impacta cronograma</option></select></Field>
          <TextArea c="col-4" label="Serviços executados" value={form.servicesPerformed} onChange={(v) => set('servicesPerformed', v)} />
          <TextArea c="col-4" label="Serviços em andamento" value={form.servicesInProgress} onChange={(v) => set('servicesInProgress', v)} />
          <TextArea c="col-4" label="Serviços concluídos" value={form.servicesCompleted} onChange={(v) => set('servicesCompleted', v)} />
          <TextArea c="col-4" label="Equipamentos mobilizados/desmobilizados" value={form.equipmentMobilized} onChange={(v) => set('equipmentMobilized', v)} />
          <TextArea c="col-4" label="Materiais recebidos" value={form.materialsReceived} onChange={(v) => set('materialsReceived', v)} />
          <TextArea c="col-4" label="Ensaios e controle tecnológico" value={form.testsAndQualityControl} onChange={(v) => set('testsAndQualityControl', v)} />
          <TextArea c="col-6" label="Ocorrências, não conformidades e riscos" value={form.occurrencesAndRisks} onChange={(v) => set('occurrencesAndRisks', v)} />
          <TextArea c="col-6" label="Providências da fiscalização" value={form.inspectionDirections} onChange={(v) => set('inspectionDirections', v)} />
          <FileField file={file} setFile={setFile} label="Relatório, documento ou fotografia" />
          <Submit saving={saving} />
        </form>
        <Documents contractId={contract.id} documents={documents.filter((item) => item.entityType === 'CONSTRUCTION_DIARY')} />
      </> : null}

      {tab === 'communications' ? <>
        <EventTable rows={contract.communications ?? []} columns={[
          { key: 'number', label: 'Número sequencial' }, { key: 'type', label: 'Tipo' },
          { key: 'protocolDate', label: 'Data do protocolo' }, { key: 'subject', label: 'Assunto' },
          { key: 'responsibleInspector', label: 'Responsável', value: (row) => String((row.responsibleInspector as Row | undefined)?.name ?? '—') },
          { key: 'currentStatus', label: 'Situação atual' }, { key: 'decisionDeadline', label: 'Limite para decisão' },
        ]} onEdit={edit} onDelete={(row) => void archive('communications', row)} />
        <form className="form-grid contract-record-form" onSubmit={submitGovernance}>
          <Field c="col-3" label="Número sequencial *"><input className="input" required value={form.number} onChange={(e) => set('number', e.target.value)} /></Field>
          <Field c="col-4" label="Tipo *"><select className="select" value={form.type} onChange={(e) => set('type', e.target.value)}>{communicationTypeOptions()}</select></Field>
          <Field c="col-2" label="Data do protocolo *"><input className="input" required type="date" value={form.protocolDate} onChange={(e) => set('protocolDate', e.target.value)} /></Field>
          <Field c="col-3" label="Responsável pela análise"><InspectorSelect inspectors={inspectors} value={form.responsibleInspectorId} onChange={(value) => set('responsibleInspectorId', value)} /></Field>
          <Field c="col-3" label="Remetente *"><select className="select" value={form.sender} onChange={(e) => set('sender', e.target.value)}><option>Contratada</option><option>Administração</option><option>Fiscalização</option><option>Gestor do contrato</option><option>Assessoria jurídica</option><option>Outro</option></select></Field>
          <Field c="col-3" label="Destinatário *"><select className="select" value={form.recipient} onChange={(e) => set('recipient', e.target.value)}><option>Administração</option><option>Contratada</option><option>Fiscalização</option><option>Gestor do contrato</option><option>Assessoria jurídica</option><option>Outro</option></select></Field>
          <Field c="col-2" label="Prioridade"><select className="select" value={form.priority} onChange={(e) => set('priority', e.target.value)}><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></Field>
          <Field c="col-2" label="Situação atual *"><select className="select" value={form.currentStatus} onChange={(e) => set('currentStatus', e.target.value)}><option>Protocolado</option><option>Distribuído</option><option>Em análise preliminar</option><option>Em instrução</option><option>Aguardando manifestação técnica</option><option>Aguardando manifestação da fiscalização</option><option>Aguardando manifestação jurídica</option><option>Aguardando decisão</option><option>Decidido</option><option>Decisão comunicada</option><option>Arquivado</option></select></Field>
          <Field c="col-2" label="Natureza do pleito"><select className="select" value={form.claimNature} onChange={(e) => set('claimNature', e.target.value)}><option>Não se aplica</option><option>Prazo</option><option>Custo</option><option>Escopo</option><option>Reequilíbrio</option><option>Reajuste</option><option>Repactuação</option><option>Riscos materializados</option><option>Força maior</option><option>Outros</option></select></Field>
          <Field c="col-3" label="Etapa do workflow *"><select className="select" value={form.workflowStage} onChange={(e) => set('workflowStage', e.target.value)}><option>Protocolo</option><option>Distribuição</option><option>Análise preliminar</option><option>Instrução</option><option>Manifestação técnica</option><option>Manifestação da fiscalização</option><option>Manifestação jurídica</option><option>Decisão da autoridade competente</option><option>Comunicação da decisão</option><option>Arquivamento</option></select></Field>
          <Field c="col-2" label="Início da instrução"><input className="input" type="date" value={form.instructionStartsAt} onChange={(e) => set('instructionStartsAt', e.target.value)} /></Field>
          <Field c="col-2" label="Fim da instrução"><input className="input" type="date" value={form.instructionEndsAt} onChange={(e) => set('instructionEndsAt', e.target.value)} /></Field>
          <Field c="col-2" label="Prazo padrão (dias)"><input className="input" type="number" min="1" value={form.standardDecisionDays} onChange={(e) => set('standardDecisionDays', e.target.value)} /></Field>
          <Field c="col-3" label="Limite para decisão"><input className="input" type="date" value={form.decisionDeadline} onChange={(e) => set('decisionDeadline', e.target.value)} /></Field>
          <Field c="col-3" label="Prorrogação aprovada?"><select className="select" value={extensionApproved ? 'yes' : 'no'} onChange={(e) => setExtensionApproved(e.target.value === 'yes')}><option value="no">Não</option><option value="yes">Sim</option></select></Field>
          <Field c="col-6" label="Justificativa da prorrogação"><input className="input" value={form.extensionJustification} onChange={(e) => set('extensionJustification', e.target.value)} /></Field>
          <Field c="col-12" label="Assunto *"><input className="input" required value={form.subject} onChange={(e) => set('subject', e.target.value)} /></Field>
          <TextArea c="col-12" required label="Descrição detalhada *" value={form.detailedDescription} onChange={(v) => set('detailedDescription', v)} />
          <TextArea c="col-4" label="Parecer técnico" value={form.technicalOpinion} onChange={(v) => set('technicalOpinion', v)} />
          <TextArea c="col-4" label="Parecer da fiscalização" value={form.inspectionOpinion} onChange={(v) => set('inspectionOpinion', v)} />
          <TextArea c="col-4" label="Parecer jurídico/decisão" value={form.legalOpinion} onChange={(v) => set('legalOpinion', v)} />
          <Field c="col-4" label="Módulo encaminhado"><select className="select" value={form.forwardedModule} onChange={(e) => set('forwardedModule', e.target.value)}><option value="">Nenhum</option><option>Aditivo de prazo</option><option>Aditivo financeiro</option><option>Apostilamento/reajuste</option><option>Repactuação</option><option>Reequilíbrio econômico-financeiro</option><option>Sanção</option><option>Recebimento</option></select></Field>
          <FileField file={file} setFile={setFile} label="Ofício, protocolo, parecer ou evidência" />
          <Submit saving={saving} />
        </form>
        <Documents contractId={contract.id} documents={documents.filter((item) => item.entityType === 'COMMUNICATION_CLAIM')} />
      </> : null}
    </section>
  </section>;
}

function Summary({ contract }: { contract: Contract }) {
  return <>
    <div className="contract-summary-grid">
      <Metric label="Valor original" value={BRL.format(Number(contract.originalValue))} />
      <Metric label="Aditivos, ajustes e apostilas" value={BRL.format(Number(contract.currentValue) - Number(contract.originalValue))} />
      <Metric label="Valor atual calculado" value={BRL.format(Number(contract.currentValue))} />
      <Metric label="Fim da vigência" value={formatDate(contract.endDate)} />
      <MetricField label="Regime de execução" value={enumLabel(contract.executionRegime)} />
      <MetricField label="Tipo de contrato" value={enumLabel(contract.nature)} />
      <MetricField label="Equipe de fiscalização" value={`${contract.inspectionTeam?.length ?? 0} designação(ões)`} />
      <MetricField label="Garantias" value={`${contract.guarantees?.length ?? 0} registro(s)`} />
    </div>
  </>;
}

function EventTable({ rows, columns, onEdit, onDelete }: { rows: Row[]; columns: Column[]; onEdit?: (row: Row) => void; onDelete?: (row: Row) => void }) {
  const hasActions = Boolean(onEdit || onDelete);
  return rows.length ? <div className="table-wrapper" style={{ marginBottom: 18 }}><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{hasActions ? <th>Ações</th> : null}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column.key}>{column.value ? column.value(row) : formatCell(row[column.key], column.key)}</td>)}{hasActions ? <td><div className="table-actions">{onEdit ? <button type="button" className="btn btn-ghost" onClick={() => onEdit(row)}><Pencil size={14} /> Editar</button> : null}{onDelete ? <button type="button" className="btn btn-ghost danger-text" onClick={() => onDelete(row)}><Trash2 size={14} /> Excluir</button> : null}</div></td> : null}</tr>)}</tbody></table></div> : <p className="muted" style={{ marginBottom: 18 }}>Nenhum registro nesta seção.</p>;
}

function Documents({ contractId, documents }: { contractId: string; documents: Contract['dossierAttachments'] }) {
  if (!documents?.length) return null;
  return <div style={{ marginTop: 18 }}><h3>Documentos vinculados</h3><div className="actions" style={{ marginTop: 10 }}>{documents.map((item) => <a key={item.id} className="btn btn-secondary" href={apiFileUrl(`/contracts/${contractId}/dossier-attachments/${item.id}/download`)} target="_blank" rel="noreferrer"><FileDown size={15} /> {item.originalName}</a>)}</div></div>;
}

function FileField({ file, setFile, label }: { file: File | null; setFile(value: File | null): void; label: string }) {
  return <Field c="col-10" label={label}><label className="btn btn-secondary" style={{ alignSelf: 'start' }}><Upload size={15} /> {file ? file.name : 'Selecionar arquivo'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label></Field>;
}

function InspectorSelect({ inspectors, value, onChange, required = false }: { inspectors: InspectorProfile[]; value: string; onChange(value: string): void; required?: boolean }) {
  return <select className="select" required={required} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Selecione</option>{inspectors.filter((item) => item.status === 'ACTIVE').map((item) => <option key={item.id} value={item.id}>{item.name} — {item.specialty}</option>)}</select>;
}

function TextArea({ c, label, value, onChange, required = false }: { c: string; label: string; value: string; onChange(value: string): void; required?: boolean }) {
  return <Field c={c} label={label}><textarea className="textarea" required={required} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

function Submit({ saving }: { saving: boolean }) {
  return <div className="contract-form-actions col-12"><button className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Salvando…' : 'Salvar registro'}</button></div>;
}

function Field({ c, label, children }: { c: string; label: string; children: React.ReactNode }) {
  return <div className={`field ${c}`}><label>{label}</label>{children}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="contract-summary-card"><span>{label}</span><strong>{value}</strong></article>;
}

function MetricField({ label, value }: { label: string; value: string }) {
  return <article className="contract-summary-card secondary"><span>{label}</span><strong>{value}</strong></article>;
}

function formatCell(value: unknown, key: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatDate(text);
  if (/value|amount|cost/i.test(key) && Number.isFinite(Number(text))) return BRL.format(Number(text));
  if (/percentage/i.test(key) && Number.isFinite(Number(text))) return `${Number(text).toLocaleString('pt-BR')}%`;
  return enumLabel(text);
}

function enumLabel(value: unknown) {
  const text = String(value ?? '—');
  const labels: Record<string, string> = {
    UNIT_PRICE: 'Empreitada por preço unitário', GLOBAL_PRICE: 'Empreitada por preço global',
    TASK: 'Tarefa', INTEGRAL: 'Empreitada integral', INTEGRATED: 'Contratação integrada',
    SEMI_INTEGRATED: 'Contratação semi-integrada',
    SUPPLY_AND_ASSOCIATED_SERVICE: 'Fornecimento e prestação de serviço associado',
    CONTINUOUS: 'Contrato continuado', SCOPE: 'Contrato de escopo',
    TERM_EXTENSION: 'Prorrogação de prazo', VALUE_INCREASE: 'Acréscimo', VALUE_DECREASE: 'Supressão',
    SCOPE_CHANGE: 'Alteração de escopo', OTHER: 'Outro', PRICE_ADJUSTMENT: 'Reajuste',
    REPACTUATION: 'Repactuação', ECONOMIC_REBALANCING: 'Reequilíbrio econômico-financeiro',
    WARNING: 'Advertência', FINE: 'Multa', TEMPORARY_SUSPENSION: 'Suspensão temporária',
    DEBARMENT: 'Impedimento', CONTRACT_MANAGER: 'Gestor do contrato',
    SUBSTITUTE_MANAGER: 'Gestor substituto', TECHNICAL_INSPECTOR: 'Fiscal técnico',
    ADMINISTRATIVE_INSPECTOR: 'Fiscal administrativo', SECTORAL_INSPECTOR: 'Fiscal setorial',
    SUBSTITUTE_INSPECTOR: 'Fiscal substituto', CASH_DEPOSIT: 'Caução em dinheiro',
    PUBLIC_DEBT_BONDS: 'Títulos da dívida pública', SURETY_BOND: 'Seguro-garantia',
    BANK_GUARANTEE: 'Fiança bancária', REQUIRED: 'Exigida', PRESENTED: 'Apresentada',
    UNDER_REVIEW: 'Em análise', APPROVED: 'Aprovada', COMPLEMENT_REQUESTED: 'Complementação solicitada',
    RENEWAL_REQUESTED: 'Renovação solicitada', REPLACED: 'Substituída', UNDER_EXECUTION: 'Em execução',
    EXECUTED: 'Executada', RELEASED: 'Liberada', EXPIRED: 'Vencida',
    MONETARY_UPDATE: 'Atualização monetária', BUDGET_ALLOCATION_CHANGE: 'Alteração de dotação',
    FUNDING_SOURCE_CHANGE: 'Alteração de fonte de recursos', REGISTRATION_CORRECTION: 'Correção cadastral',
    OTHER_LEGAL_BASIS: 'Outra hipótese legal', PROVISIONAL: 'Recebimento provisório',
    DEFINITIVE: 'Recebimento definitivo', PARTIAL: 'Recebimento parcial', BY_STAGE: 'Recebimento por etapa',
    REJECTION: 'Rejeição do objeto', APPROVE: 'Aprovar', APPROVE_WITH_PENDING_ITEMS: 'Aprovar com pendências',
    REJECT: 'Rejeitar', SUSPEND_FOR_DILIGENCE: 'Suspender para diligência', REQUESTED: 'Solicitado',
    INSPECTION_SCHEDULED: 'Vistoria agendada', WITH_PENDING_ITEMS: 'Com pendências',
    AWAITING_CORRECTIONS: 'Aguardando correções', APPROVED_PROVISIONAL: 'Aprovado para termo provisório',
    OBSERVATION_PERIOD: 'Em período de observação', APPROVED_DEFINITIVE: 'Aprovado para termo definitivo',
    TERM_ISSUED: 'Termo emitido', REJECTED: 'Rejeitado', CLOSED: 'Encerrado', OPEN: 'Aberto',
    VALIDATED: 'Validado pela fiscalização', CONTESTED: 'Impugnado/contestado',
  };
  return labels[text] ?? text;
}

function editValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return '';
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text;
}

function oldFormFromRow(row: Row) {
  return Object.keys(OLD_EMPTY).reduce((result, key) => ({
    ...result,
    [key]: editValue(row[key]),
  }), { ...OLD_EMPTY });
}

function governanceFormFromRow(tab: string, row: Row) {
  const defaults = defaultsFor(tab);
  const result = Object.keys(defaults).reduce<Record<string, string>>((current, key) => ({
    ...current,
    [key]: row[key] === undefined ? defaults[key] : editValue(row[key]),
  }), {});
  if (tab === 'construction-diaries') {
    result.openTime = row.openedAt ? String(row.openedAt).slice(11, 16) : '';
    result.closeTime = row.closedAt ? String(row.closedAt).slice(11, 16) : '';
  }
  if (tab === 'receipts' && row.pendingItems && typeof row.pendingItems === 'object') {
    const items = (row.pendingItems as { items?: Array<Record<string, unknown>> }).items;
    const first = items?.[0];
    if (first) {
      result.pendingDescription = editValue(first.description);
      result.pendingCriticality = editValue(first.criticality) || 'Média';
      result.pendingDueAt = editValue(first.dueAt);
      result.pendingResponsible = editValue(first.responsible);
    }
  }
  return result;
}

function defaultsFor(tab: string): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10);
  if (tab === 'inspection-team') return { inspectorProfileId: '', role: 'TECHNICAL_INSPECTOR', designationAct: '', startsAt: today, endsAt: '', notes: '' };
  if (tab === 'guarantees') return { number: '', modality: 'SURETY_BOND', guarantorName: '', guarantorTaxId: '', contractPercentage: '5', guaranteedValue: '', minimumPercentage: '5', issuedAt: today, startsAt: today, endsAt: '', status: 'PRESENTED', workflow: 'Análise inicial', analystInspectorId: '', executionValue: '0', recoveredValue: '0', releasedAt: '', coverages: '', history: '' };
  if (tab === 'apostilles') return { number: '', type: 'PRICE_ADJUSTMENT', date: today, indexName: '', percentage: '', valueChange: '', calculationMemo: '', justification: '' };
  if (tab === 'receipts') return { number: '', type: 'PROVISIONAL', objectCategory: 'Obras e serviços de engenharia', requestProtocol: '', protocolAt: '', inspectionDate: '', responsibleInspectorId: '', status: 'REQUESTED', decision: 'APPROVE', commissionOrdinance: '', quorum: 'Não se aplica', contractorDocuments: '', inspectionsAndTests: '', observationStartsAt: '', observationEndsAt: '', technicalWarrantyEndsAt: '', occurrences: '', consolidatedOpinion: '', competentAuthority: '', pendingDescription: '', pendingCriticality: 'Média', pendingDueAt: '', pendingResponsible: '' };
  if (tab === 'construction-diaries') return { number: '', workOrderId: '', responsibleInspectorId: '', date: today, openTime: '08:00', closeTime: '', operationalSituation: 'Obra em execução normal', weather: 'Ensolarado', temperatureCelsius: '', precipitationMm: '0', status: 'OPEN', workFront: 'Canteiro geral', ownWorkforce: '0', outsourcedWorkforce: '0', servicesPerformed: '', servicesInProgress: '', servicesCompleted: '', equipmentMobilized: '', materialsReceived: '', testsAndQualityControl: '', occurrencesAndRisks: '', contractualImpact: 'Sem impacto identificado', inspectionDirections: '' };
  if (tab === 'communications') return { number: '', type: 'Solicitação de esclarecimento', protocolDate: today, responsibleInspectorId: '', sender: 'Contratada', recipient: 'Administração', priority: 'NORMAL', currentStatus: 'Protocolado', claimNature: 'Não se aplica', workflowStage: 'Protocolo', instructionStartsAt: '', instructionEndsAt: '', standardDecisionDays: '30', decisionDeadline: '', extensionJustification: '', subject: '', detailedDescription: '', technicalOpinion: '', inspectionOpinion: '', legalOpinion: '', forwardedModule: '' };
  return {};
}

function governancePayload(tab: string, form: Record<string, string>, flags: { isPrimary: boolean; provisionalRequired: boolean; extensionApproved: boolean }) {
  const optional = (value: string) => value || undefined;
  const number = (value: string) => value ? Number(value) : undefined;
  if (tab === 'inspection-team') return { inspectorProfileId: form.inspectorProfileId, role: form.role, designationAct: form.designationAct, startsAt: form.startsAt, endsAt: optional(form.endsAt), isPrimary: flags.isPrimary, notes: optional(form.notes) };
  if (tab === 'guarantees') return { number: form.number, modality: form.modality, guarantorName: optional(form.guarantorName), guarantorTaxId: optional(form.guarantorTaxId), contractPercentage: Number(form.contractPercentage), guaranteedValue: number(form.guaranteedValue), minimumPercentage: Number(form.minimumPercentage), issuedAt: optional(form.issuedAt), startsAt: form.startsAt, endsAt: form.endsAt, status: form.status, workflow: form.workflow, analystInspectorId: optional(form.analystInspectorId), executionValue: number(form.executionValue), recoveredValue: number(form.recoveredValue), releasedAt: optional(form.releasedAt), coverages: optional(form.coverages), history: optional(form.history) };
  if (tab === 'apostilles') return { number: form.number, type: form.type, date: form.date, indexName: optional(form.indexName), percentage: number(form.percentage), valueChange: number(form.valueChange), calculationMemo: optional(form.calculationMemo), justification: form.justification };
  if (tab === 'receipts') return { number: form.number, type: form.type, objectCategory: form.objectCategory, requestProtocol: optional(form.requestProtocol), protocolAt: optional(form.protocolAt), inspectionDate: optional(form.inspectionDate), responsibleInspectorId: optional(form.responsibleInspectorId), status: form.status, provisionalRequired: flags.provisionalRequired, decision: form.decision, commissionOrdinance: optional(form.commissionOrdinance), quorum: optional(form.quorum), contractorDocuments: optional(form.contractorDocuments), inspectionsAndTests: optional(form.inspectionsAndTests), observationStartsAt: optional(form.observationStartsAt), observationEndsAt: optional(form.observationEndsAt), technicalWarrantyEndsAt: optional(form.technicalWarrantyEndsAt), occurrences: optional(form.occurrences), consolidatedOpinion: form.consolidatedOpinion, competentAuthority: optional(form.competentAuthority), pendingItems: form.pendingDescription ? { items: [{ description: form.pendingDescription, criticality: form.pendingCriticality, dueAt: form.pendingDueAt || null, responsible: form.pendingResponsible || null, status: 'Aberta' }] } : undefined };
  if (tab === 'construction-diaries') return { number: form.number, workOrderId: optional(form.workOrderId), responsibleInspectorId: optional(form.responsibleInspectorId), date: form.date, openedAt: form.openTime ? `${form.date}T${form.openTime}:00` : undefined, closedAt: form.closeTime ? `${form.date}T${form.closeTime}:00` : undefined, operationalSituation: form.operationalSituation, weather: optional(form.weather), temperatureCelsius: number(form.temperatureCelsius), precipitationMm: number(form.precipitationMm), status: form.status, workFront: optional(form.workFront), ownWorkforce: Number(form.ownWorkforce || 0), outsourcedWorkforce: Number(form.outsourcedWorkforce || 0), servicesPerformed: optional(form.servicesPerformed), servicesInProgress: optional(form.servicesInProgress), servicesCompleted: optional(form.servicesCompleted), equipmentMobilized: optional(form.equipmentMobilized), materialsReceived: optional(form.materialsReceived), testsAndQualityControl: optional(form.testsAndQualityControl), occurrencesAndRisks: optional(form.occurrencesAndRisks), contractualImpact: optional(form.contractualImpact), inspectionDirections: optional(form.inspectionDirections) };
  return { number: form.number, type: form.type, protocolDate: form.protocolDate, responsibleInspectorId: optional(form.responsibleInspectorId), sender: form.sender, recipient: form.recipient, priority: form.priority, currentStatus: form.currentStatus, claimNature: optional(form.claimNature), workflowStage: form.workflowStage, instructionStartsAt: optional(form.instructionStartsAt), instructionEndsAt: optional(form.instructionEndsAt), standardDecisionDays: Number(form.standardDecisionDays || 30), decisionDeadline: optional(form.decisionDeadline), extensionApproved: flags.extensionApproved, extensionJustification: optional(form.extensionJustification), subject: form.subject, detailedDescription: form.detailedDescription, technicalOpinion: optional(form.technicalOpinion), inspectionOpinion: optional(form.inspectionOpinion), legalOpinion: optional(form.legalOpinion), forwardedModule: optional(form.forwardedModule) };
}

function attachmentEntity(tab: string) {
  return ({ guarantees: 'GUARANTEE', apostilles: 'APOSTILLE', receipts: 'RECEIPT', 'construction-diaries': 'CONSTRUCTION_DIARY', communications: 'COMMUNICATION_CLAIM' } as Record<string, string>)[tab] ?? 'CONTRACT';
}

function attachmentKind(tab: string) {
  return ({ guarantees: 'COMPROVANTE_GARANTIA', apostilles: 'DOCUMENTO_APOSTILAMENTO', receipts: 'TERMO_RECEBIMENTO', 'construction-diaries': 'EVIDENCIA_DIARIO', communications: 'DOCUMENTO_COMUNICACAO' } as Record<string, string>)[tab] ?? 'DOCUMENTO_CONTRATUAL';
}

function guaranteeStatusOptions() {
  return <><option value="REQUIRED">Exigida</option><option value="PRESENTED">Apresentada</option><option value="UNDER_REVIEW">Em análise</option><option value="APPROVED">Aprovada</option><option value="COMPLEMENT_REQUESTED">Complementação solicitada</option><option value="RENEWAL_REQUESTED">Renovação solicitada</option><option value="REPLACED">Substituída</option><option value="UNDER_EXECUTION">Em execução</option><option value="EXECUTED">Executada</option><option value="RELEASED">Liberada</option><option value="EXPIRED">Vencida</option></>;
}

function receiptStatusOptions() {
  return <><option value="REQUESTED">Solicitado pela contratada</option><option value="UNDER_REVIEW">Em análise da fiscalização</option><option value="INSPECTION_SCHEDULED">Vistoria agendada</option><option value="WITH_PENDING_ITEMS">Com pendências</option><option value="AWAITING_CORRECTIONS">Aguardando correções</option><option value="APPROVED_PROVISIONAL">Aprovado para termo provisório</option><option value="OBSERVATION_PERIOD">Em período de observação</option><option value="APPROVED_DEFINITIVE">Aprovado para termo definitivo</option><option value="TERM_ISSUED">Termo emitido</option><option value="REJECTED">Rejeitado</option><option value="CLOSED">Encerrado</option></>;
}

function communicationTypeOptions() {
  return <><option>Solicitação de esclarecimento</option><option>Pedido de orientação técnica</option><option>Comunicação de atraso</option><option>Comunicação de interferência</option><option>Comunicação de paralisação</option><option>Notificação da fiscalização</option><option>Determinação da fiscalização</option><option>Solicitação de prorrogação de prazo</option><option>Solicitação de reajuste</option><option>Solicitação de repactuação</option><option>Solicitação de reequilíbrio econômico-financeiro</option><option>Solicitação de alteração contratual</option><option>Pleito indenizatório</option><option>Pleito de custos indiretos</option><option>Pleito de extensão de prazo</option><option>Contestação de medição</option><option>Contestação de sanção</option><option>Comunicação de caso fortuito ou força maior</option><option>Comunicação de evento de risco contratual</option><option>Outro tipo parametrizado</option></>;
}

'use client';

import { Check, CheckSquare2, History, Save } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import type { WorkOrderChecklistItem } from '@/lib/types';

export function WorkOrderChecklist({ items, canRespond, busyItemId, onRespond }: {
  items: WorkOrderChecklistItem[];
  canRespond: boolean;
  busyItemId: string | null;
  onRespond: (itemId: string, checked: boolean, note?: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, { checked: boolean; note: string }>>({});
  const completed = items.filter((item) => item.responses[0]?.checked).length;
  const required = items.filter((item) => item.required);
  const completedRequired = required.filter((item) => item.responses[0]?.checked).length;

  async function save(item: WorkOrderChecklistItem) {
    const latest = item.responses[0];
    const draft = drafts[item.id] ?? { checked: latest?.checked ?? false, note: latest?.note ?? '' };
    await onRespond(item.id, draft.checked, draft.note.trim() || undefined);
    setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
  }

  return <section className="card work-order-checklist">
    <div className="card-header"><div><h2>Checklist de execução</h2><p>Cada resposta cria um registro imutável com autor e data.</p></div><span className={`badge ${completedRequired === required.length ? 'success' : 'warning'}`}><CheckSquare2 size={13} /> {completed}/{items.length} concluído(s)</span></div>
    <div className="card-body">
      {items.length ? <><div className="checklist-progress"><span style={{ width: `${items.length ? (completed / items.length) * 100 : 0}%` }} /></div><div className="execution-checklist-list">{items.map((item, index) => {
        const latest = item.responses[0];
        const draft = drafts[item.id] ?? { checked: latest?.checked ?? false, note: latest?.note ?? '' };
        const changed = draft.checked !== (latest?.checked ?? false) || draft.note !== (latest?.note ?? '');
        return <article className={`execution-checklist-item ${latest?.checked ? 'complete' : ''}`} key={item.id}><div className="checklist-number">{latest?.checked ? <Check size={16} /> : index + 1}</div><div className="checklist-content"><div><strong>{item.label}{item.required ? <span aria-label="obrigatório"> *</span> : null}</strong>{item.description ? <p>{item.description}</p> : null}</div>{canRespond ? <div className="checklist-response-form"><label className="compact-checkbox"><input type="checkbox" checked={draft.checked} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, checked: event.target.checked } }))} /> Conforme</label><input className="input" value={draft.note} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, note: event.target.value } }))} placeholder="Observação da verificação (opcional)" /><button className="btn btn-secondary" type="button" disabled={!changed || busyItemId === item.id} onClick={() => void save(item)}><Save size={15} /> {busyItemId === item.id ? 'Salvando…' : 'Registrar'}</button></div> : null}{latest ? <details className="checklist-history"><summary><History size={13} /> Última resposta: {latest.respondedBy.name} · {formatDateTime(latest.createdAt)}{item.responses.length > 1 ? ` · ${item.responses.length} versões` : ''}</summary>{item.responses.map((response) => <div key={response.id}><span className={`badge ${response.checked ? 'success' : 'warning'}`}>{response.checked ? 'Conforme' : 'Não conforme'}</span><span>{response.note || 'Sem observação'} · {response.respondedBy.name} · {formatDateTime(response.createdAt)}</span></div>)}</details> : null}</div></article>;
      })}</div></> : <div className="comment-empty"><CheckSquare2 size={24} /><span>Esta categoria não possui checklist.</span></div>}
    </div>
  </section>;
}
